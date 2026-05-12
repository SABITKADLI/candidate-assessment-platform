import { cookies } from 'next/headers';
import { sql, auditLog } from '@cap/db';
import { zStageKey, STAGE_GROUP_OF, type StageGroup, type StageKey } from '@cap/shared';
import { sendInviteEmail } from '@cap/mailer';
import { enqueueStageScore } from '@/lib/queues';
import { rateLimit } from '@/lib/rate-limit';
import { StageScoringError, scoreStageOnServer } from '@/lib/server-stage-scoring';
import { z } from 'zod';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const zBody = z.object({
  stage_key: zStageKey,
  payload: z.record(z.string(), z.unknown()).default({}),
  score: z.number().min(0).max(100).optional(),
  duration_s: z.number().int().min(0).optional(),
});

const DEFAULT_STAGE_A: StageKey[] = [
  'A_RESUME', 'A_ID_LIVENESS', 'A_GMA',
  'A_BIG5', 'A_MBTI', 'A_RORSCHACH',
  'A_INTEGRITY', 'A_SJT',
];
const DEFAULT_STAGE_B: StageKey[] = [
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
  const { stage_key, payload, duration_s } = parsed.data;

  const jar = await cookies();
  const sessionId = jar.get('cap_sess')?.value;
  if (!sessionId) return unauthorized();

  const [session] = await sql<Array<{
    id: string; stage: StageGroup; status: string;
    stages_a: string[] | null; stages_b: string[] | null;
  }>>`
    SELECT s.id, s.stage, s.status::text,
           r.stages_a, r.stages_b
    FROM app.sessions s
    LEFT JOIN app.roles r ON r.id = s.role_id
    WHERE s.id = ${sessionId}::uuid
    LIMIT 1
  `;
  if (!session) return unauthorized();
  if (STAGE_GROUP_OF[stage_key] !== session.stage) {
    return bad('wrong_stage_group', `stage ${stage_key} does not belong to group ${session.stage}`);
  }
  if (['completed', 'expired', 'abandoned', 'disqualified'].includes(session.status)) {
    return bad('session_closed', `session is ${session.status}`);
  }

  const order: StageKey[] = session.stage === 'A'
    ? ((session.stages_a ?? DEFAULT_STAGE_A) as StageKey[])
    : ((session.stages_b ?? DEFAULT_STAGE_B) as StageKey[]);

  let validated: { payload: Record<string, unknown> };
  try {
    validated = scoreStageOnServer(stage_key, payload);
  } catch (err) {
    if (err instanceof StageScoringError) return bad(err.reason, err.message);
    throw err;
  }

  const finalPayload = validated.payload;
  let attemptId: string | null = null;
  let done = false;

  await sql.begin(async (tx) => {
    const attempts = await tx<Array<{ id: string }>>`
      INSERT INTO app.stage_attempts (
        session_id, stage_key, attempt_no, raw_payload,
        duration_s, started_at, completed_at, scoring_status, scoring_error
      ) VALUES (
        ${sessionId}::uuid, ${stage_key}::app.stage_key, 1,
        ${tx.json(finalPayload as never)},
        ${duration_s ?? null}, now(), now(), 'queued', NULL
      )
      ON CONFLICT (session_id, stage_key, attempt_no) DO UPDATE
        SET raw_payload = app.stage_attempts.raw_payload || EXCLUDED.raw_payload,
            duration_s = COALESCE(EXCLUDED.duration_s, app.stage_attempts.duration_s),
            completed_at = now(),
            started_at = COALESCE(app.stage_attempts.started_at, EXCLUDED.started_at),
            scoring_status = 'queued',
            scoring_error = NULL
      RETURNING id
    `;
    attemptId = attempts[0]?.id ?? null;

    const rows = await tx<{ done: boolean }[]>`
      SELECT (
        SELECT count(*) FROM app.stage_attempts
         WHERE session_id = ${sessionId}::uuid
           AND stage_key = ANY(${order}::app.stage_key[])
           AND completed_at IS NOT NULL
      ) = ${order.length} AS done
    `;
    done = rows[0]?.done ?? false;

    if (done) {
      await tx`
        UPDATE app.sessions
           SET status = 'completed',
               completed_at = now(),
               started_at = COALESCE(started_at, now()),
               updated_at = now()
         WHERE id = ${sessionId}::uuid
           AND status <> 'completed'
      `;
    }

    await auditLog('candidate-app', 'stage.complete', `session:${sessionId}`, {
      stage_key,
      score: null,
      duration_s: duration_s ?? null,
      stage_group_done: done,
    });
  });

  const jobId = attemptId
    ? await enqueueStageScore({
        stage_attempt_id: attemptId,
        session_id: sessionId,
        stage_key,
        reason: 'stage_completed',
      })
    : null;
  await auditLog('candidate-app', 'stage_score.enqueue', `session:${sessionId}`, {
    stage_key,
    stage_attempt_id: attemptId,
    job_id: jobId,
    reason: 'stage_completed',
    stage_group_done: done,
  });

  await checkTimingAndFlags(sessionId, stage_key, duration_s ?? null, finalPayload);
  await triggerPipelineStageBInvite(sessionId, session.stage, done);

  return Response.json({ ok: true });
}

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
  } catch { /* non-critical */ }
}

async function triggerPipelineStageBInvite(
  stageASessionId: string,
  stage: StageGroup,
  stageDone: boolean,
): Promise<void> {
  if (stage !== 'A' || !stageDone) return;

  try {
    const [row] = await sql<Array<{
      session_id: string;
      resume_token: string;
      expires_at: Date;
      email: string | null;
      role_name: string | null;
    }>>`
      SELECT b.id AS session_id,
             b.resume_token,
             b.expires_at,
             c.email,
             r.name AS role_name
      FROM app.sessions a
      JOIN app.sessions b
        ON b.pipeline_id = a.pipeline_id
       AND b.stage = 'B'::app.stage_group
      JOIN app.candidates c ON c.id = b.candidate_id
      LEFT JOIN app.roles r ON r.id = b.role_id
      WHERE a.id = ${stageASessionId}::uuid
        AND a.stage = 'A'::app.stage_group
        AND a.pipeline_id IS NOT NULL
        AND b.status IN ('pending', 'in_progress')
        AND b.expires_at > now()
      ORDER BY b.created_at ASC
      LIMIT 1
    `;
    if (!row?.email) return;

    const base = process.env.NEXT_PUBLIC_CANDIDATE_BASE_URL ?? 'http://localhost:3000';
    const result = await sendInviteEmail({
      to: row.email,
      inviteUrl: `${base}/s/${row.resume_token}`,
      stage: 'B',
      expiresAt: row.expires_at,
      roleName: row.role_name ?? undefined,
      sessionId: row.session_id,
      purpose: 'pipeline_stage_b_auto',
      oncePerSessionPurpose: true,
    });

    await auditLog('candidate-app', 'pipeline.stage_b_invite', `session:${stageASessionId}`, {
      stage_b_session_id: row.session_id,
      sent: result.sent,
      skipped: result.skipped,
      log_id: result.logId,
      resend_id: result.resendId,
    });
  } catch (err) {
    console.error('[stage.complete] pipeline Stage B invite failed:', err);
    await auditLog('candidate-app', 'pipeline.stage_b_invite_failed', `session:${stageASessionId}`, {
      error: err instanceof Error ? err.message.slice(0, 300) : String(err).slice(0, 300),
    }).catch(() => undefined);
  }
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
