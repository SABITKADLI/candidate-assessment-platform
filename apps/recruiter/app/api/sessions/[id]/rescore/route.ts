import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { sql } from '@cap/db';
import { auth0, auth0Configured } from '@/lib/auth0';
import type { StageKey } from '@cap/shared/enums';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// ── Memo system prompt ───────────────────────────────────────────────────────
const MEMO_PROMPT = `You are a senior organizational psychologist and talent analyst writing an internal hiring assessment memo.

You will receive JSON evidence containing:
- Personality inventory responses (Big5/IPIP-NEO-120, MBTI) with full item-by-item answers
- Situational Judgement Test (SJT) answers with the scenario text and the candidate's chosen response
- Cognitive ability (GMA), integrity, Rorschach, and work-sample results where available
- Session timing per stage with median benchmarks across all candidates for that stage
- Attention check outcomes (deliberately embedded validity items with known correct answers)
- Proctoring flags from the automated monitoring system

Your role is QUALITATIVE ANALYSIS only. Do NOT quote composite scores, stage percentages, or T-scores — the recruiter already sees those in the dashboard. Instead, interpret *what the data reveals* about the person and their likely on-the-job behaviour.

Output strict Markdown with these sections, in this order:

# Candidate Assessment — {role_name}

## Personality & Work Style
2–3 paragraphs interpreting the Big5 factor profile as a coherent description of the candidate. Describe:
- What their factor combination suggests about work style, collaboration, decision-making, and stress response.
- Noteworthy patterns or tensions (e.g., high Conscientiousness with low Agreeableness — disciplined but potentially abrasive under pressure).
- Any items where the candidate gave extreme ratings (1 or 5) that are unusual, contradictory, or revealing. Reference the item text directly.

## Situational Judgement Analysis
For each SJT scenario where the candidate chose a suboptimal response, identify it by its key situation and explain what that choice reveals about their priorities or blind spots. Look for patterns across all scenarios:
- Do they default to individual action or team communication?
- Do they defer to authority or trust their own judgement?
- Are there any responses that raise ethical concerns?

## Cognitive & Task Performance
Brief qualitative assessment of GMA, coding/debug, work sample, and verbal stages if present. Describe what the performance level implies for the role — not a number but what capability it signals.

## Response Authenticity
- Compare each stage's completion time against the median benchmark. Flag any stage completed in less than 50% of the median time as potentially rushed.
- Report attention check outcomes. If a check was failed, state which one and what it implies about response authenticity.
- Summarise open proctoring flags. For each flag, state whether it appears to be a technical artefact or a genuine concern. Do not speculate beyond the evidence.

## Recommendation
One of: **Advance to Stage C**, **Hold for human review**, **Decline**.
2–3 sentences of justification grounded entirely in the qualitative findings above — not the composite number.

## Interviewer Probes
4–6 specific behavioral interview questions, each directly derived from a weakness, inconsistency, or pattern identified in this assessment. Format each as: "[observation from evidence] → Ask: Tell me about a time when…"

Hard rules:
- No composite scores, stage percentages, or T-scores.
- No invented traits, examples, or behaviours not supported by the evidence.
- No PII beyond the role name.
- Under 650 words total.
- If \`missing_buckets\` is non-empty, add under Recommendation: "Missing data: <list of missing stages>."`;

// ── Stage → scoring bucket map ───────────────────────────────────────────────
const STAGE_TO_BUCKET: Record<string, string> = {
  A_RESUME: 'resume', A_ID_LIVENESS: 'id_liveness', A_GMA: 'gma',
  A_BIG5: 'big5_mbti', A_MBTI: 'big5_mbti', A_RORSCHACH: 'rorschach',
  A_INTEGRITY: 'integrity', A_SJT: 'sjt',
  B_CODING: 'coding', B_DEBUG: 'coding', B_WORK_SAMPLE: 'work_sample',
  B_ASYNC_VIDEO: 'verbal', B_VERBAL: 'verbal',
};

const DEFAULT_WEIGHTS: Record<string, number> = {
  gma: 20, work_sample: 20, coding: 20, verbal: 15,
  sjt: 10, big5_mbti: 8, integrity: 5, rorschach: 2,
};

// ── Composite ────────────────────────────────────────────────────────────────
async function computeComposite(session_id: string) {
  const [cfg] = await sql<Array<{
    weights: Record<string, number>;
    weights_version: number;
    proctoring_mult: string | null;
  }>>`
    SELECT
      coalesce(r.stage_weights, ${sql.json(DEFAULT_WEIGHTS as never)}::jsonb) AS weights,
      coalesce(r.weights_version, 1) AS weights_version,
      (SELECT proctoring_mult::text FROM app.scores WHERE session_id = s.id) AS proctoring_mult
    FROM app.sessions s
    LEFT JOIN app.roles r ON r.id = s.role_id
    WHERE s.id = ${session_id}::uuid
  `;
  if (!cfg) throw new Error(`session ${session_id} not found`);

  const rows = await sql<Array<{ stage_key: StageKey; score: string | null }>>`
    SELECT DISTINCT ON (stage_key) stage_key, score
    FROM app.stage_attempts
    WHERE session_id = ${session_id}::uuid AND score IS NOT NULL
    ORDER BY stage_key, score DESC NULLS LAST, attempt_no DESC
  `;

  const bucket: Record<string, number[]> = {};
  for (const r of rows) {
    const b = STAGE_TO_BUCKET[r.stage_key as string];
    if (!b || r.score == null) continue;
    (bucket[b] ??= []).push(Number(r.score));
  }

  const per_stage: Record<string, number> = {};
  for (const [b, xs] of Object.entries(bucket)) {
    per_stage[b] = Math.round((xs.reduce((s, x) => s + x, 0) / xs.length) * 1000) / 1000;
  }

  const weights = cfg.weights;
  let num = 0, den = 0;
  const missing: string[] = [];
  for (const [b, w] of Object.entries(weights)) {
    if (per_stage[b] == null) { missing.push(b); continue; }
    num += w * per_stage[b]!;
    den += w;
  }

  const mult = cfg.proctoring_mult == null
    ? 1.0
    : Math.min(1.0, Math.max(0.5, Number(cfg.proctoring_mult)));
  const composite = Math.round(Math.max(0, Math.min(100, mult * (den > 0 ? num / den : 0))) * 1000) / 1000;

  return { composite, per_stage, proctoring_mult: mult, weights_version: cfg.weights_version, missing_buckets: missing };
}

// ── Evidence ─────────────────────────────────────────────────────────────────
async function gatherEvidence(session_id: string, composite: Awaited<ReturnType<typeof computeComposite>>) {
  const [meta] = await sql<Array<{ stage: string; status: string; role_name: string | null; email: string | null }>>`
    SELECT s.stage::text, s.status::text, r.name AS role_name, c.email
    FROM app.sessions s
    LEFT JOIN app.roles r ON r.id = s.role_id
    LEFT JOIN app.candidates c ON c.id = s.candidate_id
    WHERE s.id = ${session_id}::uuid
  `;
  if (!meta) throw new Error('session not found');

  // Full attempts with raw_payload (includes Q&A for Big5/SJT)
  const attempts = await sql<Array<{
    stage_key: string;
    score: string | null;
    duration_s: number | null;
    raw_payload: unknown;
  }>>`
    SELECT stage_key::text, score, duration_s, raw_payload
    FROM app.stage_attempts WHERE session_id = ${session_id}::uuid
    ORDER BY stage_key, attempt_no
  `;

  // Timing benchmarks: median duration per stage across all sessions
  const stageKeys = [...new Set(attempts.map((a) => a.stage_key))];
  const benchmarks = stageKeys.length > 0
    ? await sql<Array<{ stage_key: string; median_s: number | null }>>`
        SELECT stage_key::text,
               PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY duration_s)::integer AS median_s
        FROM app.stage_attempts
        WHERE stage_key = ANY(${stageKeys}::app.stage_key[])
          AND duration_s IS NOT NULL
        GROUP BY stage_key
      `
    : [];

  const timingBenchmarks = Object.fromEntries(benchmarks.map((b) => [b.stage_key, b.median_s]));

  const flags = await sql<Array<{ severity: string; reason: string }>>`
    SELECT severity::text, reason FROM app.proctoring_flags
    WHERE session_id = ${session_id}::uuid
      AND resolved = false
      AND severity IN ('medium','high','critical')
    ORDER BY created_at DESC LIMIT 25
  `;

  return {
    role_name: meta.role_name ?? 'Unknown role',
    stage: meta.stage,
    status: meta.status,
    attempts: attempts.map((a) => ({
      stage_key: a.stage_key,
      score: a.score == null ? null : Number(a.score),
      duration_s: a.duration_s,
      median_duration_s: timingBenchmarks[a.stage_key] ?? null,
      responses: a.raw_payload,
    })),
    open_flags: flags,
    composite,
  };
}

function parseRecommendation(md: string): 'advance' | 'hold' | 'decline' | 'unknown' {
  if (/advance to stage c/i.test(md)) return 'advance';
  if (/hold for human review/i.test(md)) return 'hold';
  if (/\bdecline\b/i.test(md)) return 'decline';
  return 'unknown';
}

// ── Route ────────────────────────────────────────────────────────────────────
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (auth0Configured) {
    const session = await auth0.getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: 'invalid_id' }, { status: 400 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY not set' }, { status: 503 });
  }

  try {
    // 1. Compute composite from all stage attempts
    const composite = await computeComposite(id);

    // 2. Persist composite score
    await sql`
      INSERT INTO app.scores (session_id, composite, per_stage, proctoring_mult, weights_version, computed_at)
      VALUES (${id}::uuid, ${composite.composite}, ${sql.json(composite.per_stage as never)},
              ${composite.proctoring_mult}, ${composite.weights_version}, now())
      ON CONFLICT (session_id) DO UPDATE
        SET composite        = EXCLUDED.composite,
            per_stage        = EXCLUDED.per_stage,
            proctoring_mult  = EXCLUDED.proctoring_mult,
            weights_version  = EXCLUDED.weights_version,
            computed_at      = now()
    `;

    // 3. Build evidence and call Claude
    const evidence = await gatherEvidence(id, composite);
    const client = new Anthropic({ apiKey });
    const msg = await client.messages.create({
      model: process.env.MEMO_MODEL ?? 'claude-sonnet-4-20250514',
      max_tokens: 1536,
      system: MEMO_PROMPT,
      messages: [{ role: 'user', content: JSON.stringify(evidence) }],
    });

    const markdown = msg.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim();

    const recommendation = parseRecommendation(markdown);

    // 4. Persist memo
    await sql`
      UPDATE app.scores
      SET memo_text      = ${markdown},
          recommendation = ${recommendation}
      WHERE session_id = ${id}::uuid
    `;

    return NextResponse.json({ ok: true, composite: composite.composite, recommendation, markdown });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
