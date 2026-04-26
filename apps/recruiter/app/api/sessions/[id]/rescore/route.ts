import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { sql } from '@cap/db';
import { auth0, auth0Configured } from '@/lib/auth0';
import type { StageKey } from '@cap/shared/enums';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// ── Memo system prompt (mirrors apps/scoring-worker/prompts/memo.md) ────────
const MEMO_PROMPT = `You are an experienced technical recruiter writing a one-page hiring memo for an internal hiring panel.

Use ONLY the JSON evidence the user provides. Do not invent facts, scores, or behaviors. If a stage was not run, do not speculate about it.

Output strict Markdown with these sections, in this order:

# Candidate memo — {role_name}

**Composite**: {composite}/100   **Stage**: {stage}   **Proctoring multiplier**: {proctoring_mult}

## Strengths
3–5 bullets, each grounded in a specific stage_key and its score or signal. Cite the stage by name (e.g. "GMA").

## Risks
3–5 bullets. Include any open proctoring flags with severity ≥ medium. If keystroke or paste signals look anomalous, mention them factually without accusations.

## Recommendation
One of: **Advance to Stage C**, **Hold for human review**, **Decline**.
One sentence justification, anchored on the composite and the highest-impact stage scores.

## Notes for the interviewer
2–4 bullets: specific topics the human interviewer should probe, derived from weakest stages.

Hard rules:
- Do not output JSON, code blocks, or YAML.
- Do not include the candidate's email or any PII other than what's already in the input.
- Keep the entire memo under 350 words.
- If \`missing_buckets\` is non-empty, add a line under Recommendation: "Missing data: <list>".`;

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

  const attempts = await sql<Array<{ stage_key: string; score: string | null; duration_s: number | null }>>`
    SELECT stage_key::text, score, duration_s
    FROM app.stage_attempts WHERE session_id = ${session_id}::uuid
    ORDER BY stage_key, attempt_no
  `;

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
      model: process.env.MEMO_MODEL ?? 'claude-sonnet-4-6-20250930',
      max_tokens: 1024,
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
