import { cookies } from 'next/headers';
import { sql, auditLog } from '@cap/db';
import { zStageKey, STAGE_GROUP_OF, type StageGroup, type StageKey } from '@cap/shared';
import { enqueueScoring } from '@/lib/queues';
import { rateLimit } from '@/lib/rate-limit';
import { z } from 'zod';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Body schema: clients post a minimal payload. `score` is optional; some
// stages are scored asynchronously (Big5 is just answers; the scoring worker
// doesn't know what to do with them yet — that's fine, a later phase adds
// per-stage scorers that update stage_attempts.score directly).
const zBody = z.object({
  stage_key: zStageKey,
  // Stage-local results — persisted on the attempt for forensics.
  payload: z.record(z.string(), z.unknown()).default({}),
  // Optional pre-computed score for self-scorable stages (GMA, SJT).
  score: z.number().min(0).max(100).optional(),
  duration_s: z.number().int().min(0).optional(),
});

// Ordered list of Stage A + B keys used to decide "is this the last stage?".
// Keep in lockstep with the pipeline design (see Project_information_).
const STAGE_A_ORDER: StageKey[] = [
  'A_RESUME', 'A_ID_LIVENESS', 'A_GMA',
  'A_BIG5', 'A_MBTI', 'A_RORSCHACH',
  'A_INTEGRITY', 'A_SJT',
];
const STAGE_B_ORDER: StageKey[] = [
  'B_CODING', 'B_DEBUG', 'B_WORK_SAMPLE',
  'B_ASYNC_VIDEO', 'B_VERBAL',
];

export async function POST(req: Request) {
  const limited = await rateLimit(req, 'stage_complete', 20, 60);
  if (limited) return limited;

  let body: unknown;
  try { body = await req.json(); } catch { return bad('bad_json'); }
  const parsed = zBody.safeParse(body);
  if (!parsed.success) return bad('bad_shape', parsed.error.message);
  const { stage_key, payload, score, duration_s } = parsed.data;

  const jar = await cookies();
  const sessionId = jar.get('cap_sess')?.value;
  if (!sessionId) return unauthorized();

  // Authorize: the cookie must actually map to an in-progress session whose
  // stage group matches the stage_key being completed.
  const [session] = await sql<Array<{ id: string; stage: StageGroup; status: string }>>`
    SELECT id, stage, status::text
    FROM app.sessions
    WHERE id = ${sessionId}::uuid
    LIMIT 1
  `;
  if (!session) return unauthorized();
  if (STAGE_GROUP_OF[stage_key] !== session.stage) {
    return bad('wrong_stage_group', `stage ${stage_key} does not belong to group ${session.stage}`);
  }
  if (session.status === 'completed' || session.status === 'expired'
      || session.status === 'abandoned' || session.status === 'disqualified') {
    return bad('session_closed', `session is ${session.status}`);
  }

  // Upsert the attempt. We allow re-posting to the same stage while in
  // progress (e.g. client retry); attempt_no stays 1 until a stage reopens.
  await sql.begin(async (tx) => {
    await tx`
      INSERT INTO app.stage_attempts (
        session_id, stage_key, attempt_no, score, raw_payload,
        duration_s, started_at, completed_at
      ) VALUES (
        ${sessionId}::uuid, ${stage_key}::app.stage_key, 1,
        ${score ?? null}, ${tx.json(payload as never)},
        ${duration_s ?? null}, now(), now()
      )
      ON CONFLICT (session_id, stage_key, attempt_no) DO UPDATE
        SET score        = COALESCE(EXCLUDED.score, app.stage_attempts.score),
            raw_payload  = app.stage_attempts.raw_payload || EXCLUDED.raw_payload,
            duration_s   = COALESCE(EXCLUDED.duration_s, app.stage_attempts.duration_s),
            completed_at = now(),
            started_at   = COALESCE(app.stage_attempts.started_at, EXCLUDED.started_at)
    `;

    // Detect stage-group completion: every stage in the current group has an
    // attempt with completed_at not null.
    const order = session.stage === 'A' ? STAGE_A_ORDER : STAGE_B_ORDER;
    const rows = await tx<{ done: boolean }[]>`
      SELECT (
        SELECT count(*) FROM app.stage_attempts
         WHERE session_id = ${sessionId}::uuid
           AND stage_key = ANY(${order}::app.stage_key[])
           AND completed_at IS NOT NULL
      ) = ${order.length} AS done
    `;
    const done = rows[0]?.done ?? false;

    if (done) {
      await tx`
        UPDATE app.sessions
           SET status       = 'completed',
               completed_at = now(),
               started_at   = COALESCE(started_at, now()),
               updated_at   = now()
         WHERE id = ${sessionId}::uuid
           AND status <> 'completed'
      `;
    }

    await auditLog('candidate-app', 'stage.complete', `session:${sessionId}`, {
      stage_key, score: score ?? null, duration_s: duration_s ?? null,
      stage_group_done: done,
    });

    // Enqueue scoring once the whole stage group is done. For intra-stage
    // updates (e.g. each of 50 GMA questions posted individually) we'd
    // skip this — but the handler is stage-level, not question-level, so a
    // single POST == a single stage done.
    if (done) {
      const jobId = await enqueueScoring({ session_id: sessionId, reason: 'stage_completed' });
      await auditLog('candidate-app', 'scoring.enqueue', `session:${sessionId}`, {
        job_id: jobId ?? null, reason: 'stage_completed',
      });
    }
  });

  // Post-transaction: timing flag + attention check flag (non-critical, best-effort)
  await checkTimingAndFlags(sessionId, stage_key, duration_s ?? null, payload);

  return Response.json({ ok: true });
}

// Minimum expected seconds per stage type — flags below-average completions.
const MIN_STAGE_SECONDS: Partial<Record<string, number>> = {
  A_BIG5: 90, A_SJT: 60, A_INTEGRITY: 45,
  A_RORSCHACH: 60, A_GMA: 30,
  B_CODING: 90, B_DEBUG: 60, B_WORK_SAMPLE: 90, B_ASYNC_VIDEO: 30,
};

async function checkTimingAndFlags(
  sessionId: string,
  stage_key: string,
  duration_s: number | null,
  payload: unknown,
): Promise<void> {
  try {
    const flags: Array<{ severity: string; reason: string; details: unknown }> = [];

    // Timing: flag if below absolute minimum or below 50% of median
    if (duration_s != null) {
      const [bench] = await sql<{ median_s: number | null }[]>`
        SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY duration_s)::integer AS median_s
        FROM app.stage_attempts
        WHERE stage_key = ${stage_key}::app.stage_key AND duration_s IS NOT NULL
      `;
      const median = bench?.median_s ?? null;
      const absMin = MIN_STAGE_SECONDS[stage_key] ?? null;
      const tooFast =
        (absMin != null && duration_s < absMin) ||
        (median != null && median > 30 && duration_s < median * 0.5);

      if (tooFast) {
        flags.push({
          severity: 'medium',
          reason: 'timing.too_fast',
          details: { duration_s, median_s: median, min_threshold: absMin },
        });
      }
    }

    // Attention check failures embedded in payload
    const attn = (payload as Record<string, unknown> | null)?.attention_check_failures;
    if (Array.isArray(attn) && attn.length > 0) {
      flags.push({
        severity: 'medium',
        reason: 'attention.check_failed',
        details: { failures: attn, stage: stage_key },
      });
    }

    if (flags.length === 0) return;

    await sql`
      INSERT INTO app.proctoring_flags (session_id, stage_key, severity, reason, details)
      SELECT ${sessionId}::uuid, ${stage_key}::app.stage_key,
             (f->>'severity')::app.flag_severity,
             f->>'reason',
             coalesce(f->'details', '{}'::jsonb)
      FROM jsonb_array_elements(${sql.json(flags as never)}::jsonb) AS f
    `;
  } catch { /* non-critical; don't fail the stage completion */ }
}

function bad(reason: string, detail?: string) {
  return new Response(JSON.stringify({ error: reason, detail }), {
    status: 400, headers: { 'Content-Type': 'application/json' },
  });
}
function unauthorized() {
  return new Response(JSON.stringify({ error: 'no_session' }), {
    status: 401, headers: { 'Content-Type': 'application/json' },
  });
}
