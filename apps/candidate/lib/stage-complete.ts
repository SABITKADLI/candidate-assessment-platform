import { sql, auditLog } from '@cap/db';
import { STAGE_GROUP_OF, type StageKey } from '@cap/shared';
import { enqueueScoring } from './queues';

const STAGE_A_ORDER: StageKey[] = [
  'A_RESUME','A_ID_LIVENESS','A_GMA',
  'A_BIG5','A_MBTI','A_RORSCHACH',
  'A_INTEGRITY','A_SJT',
];
const STAGE_B_ORDER: StageKey[] = [
  'B_CODING','B_DEBUG','B_WORK_SAMPLE',
  'B_ASYNC_VIDEO','B_VERBAL',
];

export interface CompleteArgs {
  session_id: string;
  stage_key: StageKey;
  payload: Record<string, unknown>;
  score?: number;
  duration_s?: number;
}

export interface CompleteResult {
  stage_group_done: boolean;
  scoring_job_id: string | null;
}

/**
 * Idempotently complete a stage attempt, flip the session to `completed`
 * when all stages in its group are done, and enqueue a scoring job on the
 * group-completion transition. Safe to call twice for the same stage.
 */
export async function completeStage(a: CompleteArgs): Promise<CompleteResult> {
  const group = STAGE_GROUP_OF[a.stage_key];
  const order = group === 'A' ? STAGE_A_ORDER : STAGE_B_ORDER;

  let done = false;
  await sql.begin(async (tx) => {
    await tx`
      INSERT INTO app.stage_attempts (
        session_id, stage_key, attempt_no, score, raw_payload,
        duration_s, started_at, completed_at
      ) VALUES (
        ${a.session_id}::uuid, ${a.stage_key}::app.stage_key, 1,
        ${a.score ?? null}, ${tx.json(a.payload as never)},
        ${a.duration_s ?? null}, now(), now()
      )
      ON CONFLICT (session_id, stage_key, attempt_no) DO UPDATE
        SET score        = COALESCE(EXCLUDED.score, app.stage_attempts.score),
            raw_payload  = app.stage_attempts.raw_payload || EXCLUDED.raw_payload,
            duration_s   = COALESCE(EXCLUDED.duration_s, app.stage_attempts.duration_s),
            completed_at = now(),
            started_at   = COALESCE(app.stage_attempts.started_at, EXCLUDED.started_at)
    `;

    const rows = await tx<{ done: boolean }[]>`
      SELECT (
        SELECT count(*) FROM app.stage_attempts
         WHERE session_id = ${a.session_id}::uuid
           AND stage_key = ANY(${order}::app.stage_key[])
           AND completed_at IS NOT NULL
      ) = ${order.length} AS done
    `;
    done = rows[0]?.done ?? false;

    if (done) {
      await tx`
        UPDATE app.sessions
           SET status = 'completed', completed_at = now(), updated_at = now()
         WHERE id = ${a.session_id}::uuid AND status <> 'completed'
      `;
    }

    await auditLog('candidate-app', 'stage.complete', `session:${a.session_id}`, {
      stage_key: a.stage_key, score: a.score ?? null, duration_s: a.duration_s ?? null,
      stage_group_done: done,
    });
  });

  let jobId: string | null = null;
  if (done) {
    jobId = await enqueueScoring({ session_id: a.session_id, reason: 'stage_completed' });
    await auditLog('candidate-app', 'scoring.enqueue', `session:${a.session_id}`, {
      job_id: jobId, reason: 'stage_completed',
    });
  }
  return { stage_group_done: done, scoring_job_id: jobId };
}
