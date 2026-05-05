import type { Queue } from 'bullmq';
import { sql, auditLog } from '@cap/db';
import type { ScoringJob, StageScoreJob } from '@cap/shared/queues';
import { reconcile as reconcileResults } from '@cap/graders';
import { getStageGrader } from './graders.js';
import type { GradeOutcome, GraderContext, RunDraft, StageAttemptRow } from './types.js';

const DEFAULT_STAGE_A = [
  'A_RESUME', 'A_ID_LIVENESS', 'A_GMA',
  'A_BIG5', 'A_MBTI', 'A_RORSCHACH',
  'A_INTEGRITY', 'A_SJT',
] as const;
const DEFAULT_STAGE_B = ['B_CODING', 'B_DEBUG', 'B_WORK_SAMPLE', 'B_ASYNC_VIDEO', 'B_VERBAL'] as const;

export async function processStageScore(job: StageScoreJob, ctx: GraderContext): Promise<Record<string, unknown>> {
  const attempt = await loadAttempt(job.stage_attempt_id);
  if (!attempt) throw new Error(`stage_attempt ${job.stage_attempt_id} not found`);
  if (!attempt.completed_at) return { skipped: 'attempt_not_completed', stage_attempt_id: attempt.id };

  await markAttempt(attempt.id, 'grading', null);
  const grader = getStageGrader(attempt.stage_key);
  await auditLog('scoring-worker', 'grader.start', `stage_attempt:${attempt.id}`, {
    stage_key: attempt.stage_key,
    grader_version: grader.version,
    reason: job.reason ?? null,
  });

  let outcome: GradeOutcome;
  try {
    outcome = await grader.grade(attempt, ctx);
  } catch (err) {
    const message = publicError(err);
    await markAttempt(attempt.id, 'failed', message);
    await auditLog('scoring-worker', 'grader.failed', `stage_attempt:${attempt.id}`, {
      stage_key: attempt.stage_key,
      grader_version: grader.version,
      error: message,
    });
    throw err;
  }

  if (outcome.pending) {
    await markAttempt(attempt.id, 'queued', outcome.pending_reason ?? null);
    await scheduleStageScore(ctx.stageQueue, {
      stage_attempt_id: attempt.id,
      session_id: attempt.session_id,
      stage_key: attempt.stage_key,
      reason: 'transcribe_poll',
    }, outcome.pending_delay_ms ?? 15_000);
    return { pending: true, reason: outcome.pending_reason ?? null };
  }

  if (!outcome.primary) throw new Error(`grader ${grader.version} returned no primary run`);
  const primaryRunId = await insertRun(attempt.id, outcome.primary);
  await auditLog('scoring-worker', 'grader.primary', `stage_attempt:${attempt.id}`, {
    score: outcome.primary.result.score,
    confidence: outcome.primary.result.confidence,
    flags: outcome.primary.result.flags,
  });

  const verifierRunId = outcome.verifier ? await insertRun(attempt.id, outcome.verifier) : null;
  if (outcome.verifier) {
    await auditLog('scoring-worker', 'grader.verifier', `stage_attempt:${attempt.id}`, {
      score: outcome.verifier.result.score,
      confidence: outcome.verifier.result.confidence,
      flags: outcome.verifier.result.flags,
    });
  }

  const reconciliation = outcome.reconciliation
    ?? reconcileResults(outcome.primary.result, outcome.verifier?.result);
  await saveReconciliation(attempt.id, primaryRunId, verifierRunId, reconciliation);

  const shadow = process.env.GRADER_SHADOW === 'true';
  const nextStatus = reconciliation.needs_review ? 'review' : 'final';
  if (shadow) {
    await markAttempt(attempt.id, nextStatus, null);
  } else {
    await sql`
      UPDATE app.stage_attempts
         SET score = ${reconciliation.score},
             scoring_status = ${nextStatus},
             scoring_error = NULL,
             scored_at = CASE WHEN ${nextStatus} = 'final' THEN now() ELSE scored_at END
       WHERE id = ${attempt.id}::uuid
    `;
  }

  await auditLog('scoring-worker', 'grader.reconcile', `stage_attempt:${attempt.id}`, {
    stage_key: attempt.stage_key,
    grader_version: grader.version,
    primary_run_id: primaryRunId,
    verifier_run_id: verifierRunId,
    reconciled_score: reconciliation.score,
    divergence: reconciliation.divergence,
    needs_review: reconciliation.needs_review,
    review_reason: reconciliation.review_reason ?? null,
    flags: reconciliation.merged_flags,
    shadow,
  });

  if (reconciliation.needs_review) {
    await auditLog('scoring-worker', 'grader.review_required', `stage_attempt:${attempt.id}`, {
      reason: reconciliation.review_reason ?? null,
      flags: reconciliation.merged_flags,
    });
  } else {
    await enqueueFinalizeIfReady(attempt.session_id, ctx.finalizeQueue);
  }

  return {
    stage_attempt_id: attempt.id,
    stage_key: attempt.stage_key,
    grader_version: grader.version,
    primary_score: outcome.primary.result.score,
    verifier_score: outcome.verifier?.result.score ?? null,
    reconciled_score: reconciliation.score,
    divergence: reconciliation.divergence,
    flags: reconciliation.merged_flags,
    needs_review: reconciliation.needs_review,
  };
}

export async function processSandboxDone(job: StageScoreJob, ctx: GraderContext): Promise<Record<string, unknown>> {
  await scheduleStageScore(ctx.stageQueue, {
    stage_attempt_id: job.stage_attempt_id,
    session_id: job.session_id,
    stage_key: job.stage_key,
    reason: 'sandbox_done',
  }, 0);
  return { queued_stage_score: job.stage_attempt_id };
}

export async function sessionReadyForFinalization(sessionId: string): Promise<boolean> {
  const required = await requiredStages(sessionId);
  if (!required.length) return false;
  const rows = await sql<Array<{ stage_key: string; scoring_status: string }>>`
    SELECT stage_key::text AS stage_key, scoring_status
    FROM app.stage_attempts
    WHERE session_id = ${sessionId}::uuid
      AND stage_key = ANY(${required}::app.stage_key[])
      AND completed_at IS NOT NULL
  `;
  const final = new Set(rows.filter((row) => row.scoring_status === 'final').map((row) => row.stage_key));
  return required.every((stage) => final.has(stage));
}

export async function enqueueFinalizeIfReady(sessionId: string, finalizeQueue: Queue<ScoringJob>): Promise<void> {
  if (!(await sessionReadyForFinalization(sessionId))) return;
  await finalizeQueue.add('score', {
    session_id: sessionId,
    reason: 'stage_completed',
  }, {
    jobId: `finalize-${sessionId}-${Date.now()}`,
    removeOnComplete: { age: 3600, count: 1000 },
    removeOnFail: { age: 24 * 3600 },
    attempts: 3,
    backoff: { type: 'exponential', delay: 5_000 },
  });
  await auditLog('scoring-worker', 'session.finalize.enqueue', `session:${sessionId}`, {
    reason: 'all_stage_scores_final',
  });
}

async function loadAttempt(stageAttemptId: string): Promise<StageAttemptRow | null> {
  const [row] = await sql<StageAttemptRow[]>`
    SELECT a.id,
           a.session_id,
           a.stage_key::text AS stage_key,
           a.raw_payload,
           a.duration_s,
           a.completed_at,
           a.scoring_status,
           a.scoring_error,
           r.name AS role_name,
           r.description AS role_description,
           NULL::text AS session_locale
    FROM app.stage_attempts a
    JOIN app.sessions s ON s.id = a.session_id
    LEFT JOIN app.roles r ON r.id = s.role_id
    WHERE a.id = ${stageAttemptId}::uuid
    LIMIT 1
  `;
  return row ?? null;
}

async function insertRun(stageAttemptId: string, run: RunDraft): Promise<string> {
  const [row] = await sql<Array<{ id: string }>>`
    INSERT INTO app.score_runs (
      stage_attempt_id, grader_version, model, pass_no, score, subscores,
      evidence, confidence, flags, prompt_hash, raw_response,
      input_token_count, output_token_count, latency_ms
    ) VALUES (
      ${stageAttemptId}::uuid,
      ${run.grader_version},
      ${run.model},
      ${run.pass_no},
      ${run.result.score},
      ${sql.json(run.result.subscores as never)},
      ${sql.json(run.result.evidence as never)},
      ${run.result.confidence},
      ${run.result.flags},
      ${run.prompt_hash},
      ${run.raw_response ?? null},
      ${run.input_token_count ?? null},
      ${run.output_token_count ?? null},
      ${run.latency_ms ?? null}
    )
    RETURNING id
  `;
  return row!.id;
}

async function saveReconciliation(
  stageAttemptId: string,
  primaryRunId: string,
  verifierRunId: string | null,
  rec: {
    score: number;
    divergence: number;
    needs_review: boolean;
    review_reason?: string;
  },
): Promise<void> {
  await sql`
    INSERT INTO app.score_reconciliations (
      stage_attempt_id, primary_run_id, verifier_run_id, reconciled_score,
      divergence, needs_review, review_reason
    ) VALUES (
      ${stageAttemptId}::uuid,
      ${primaryRunId}::uuid,
      ${verifierRunId}::uuid,
      ${rec.score},
      ${rec.divergence},
      ${rec.needs_review},
      ${rec.review_reason ?? null}
    )
    ON CONFLICT (stage_attempt_id) DO UPDATE
      SET primary_run_id = EXCLUDED.primary_run_id,
          verifier_run_id = EXCLUDED.verifier_run_id,
          reconciled_score = EXCLUDED.reconciled_score,
          divergence = EXCLUDED.divergence,
          needs_review = EXCLUDED.needs_review,
          review_reason = EXCLUDED.review_reason,
          updated_at = now()
  `;
}

async function markAttempt(id: string, status: string, error: string | null): Promise<void> {
  await sql`
    UPDATE app.stage_attempts
       SET scoring_status = ${status},
           scoring_error = ${error}
     WHERE id = ${id}::uuid
  `;
}

async function scheduleStageScore(
  queue: Queue<StageScoreJob>,
  job: StageScoreJob,
  delay: number,
): Promise<void> {
  await queue.add('grade', job, {
    jobId: `stage-score-${job.stage_attempt_id}-${Date.now()}`,
    delay,
    removeOnComplete: { age: 3600 * 24, count: 5000 },
    removeOnFail: { age: 3600 * 48 },
    attempts: 3,
    backoff: { type: 'exponential', delay: 5_000 },
  });
}

async function requiredStages(sessionId: string): Promise<string[]> {
  const [row] = await sql<Array<{
    stage: string;
    stages_a: string[] | null;
    stages_b: string[] | null;
  }>>`
    SELECT s.stage::text AS stage, r.stages_a, r.stages_b
    FROM app.sessions s
    LEFT JOIN app.roles r ON r.id = s.role_id
    WHERE s.id = ${sessionId}::uuid
    LIMIT 1
  `;
  if (!row) return [];
  return row.stage === 'A'
    ? (row.stages_a ?? [...DEFAULT_STAGE_A])
    : (row.stages_b ?? [...DEFAULT_STAGE_B]);
}

function publicError(err: unknown): string {
  return err instanceof Error ? err.message.slice(0, 500) : String(err).slice(0, 500);
}
