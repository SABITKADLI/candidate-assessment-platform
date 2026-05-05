// Queue names + job shapes consumed by workers. Keep in lockstep with the
// corresponding Worker() constructors in @cap/scoring-worker and
// @cap/sandbox-worker.

export const SCORING_QUEUE = 'scoring-runs';

export type ScoringReason = 'stage_completed' | 'manual_rescore' | 'recruiter_action';

export interface ScoringJob {
  session_id: string;
  reason: ScoringReason;
  ats?: Array<'greenhouse' | 'lever' | 'workday'>;
}

export const SANDBOX_QUEUE = 'sandbox-runs';

export const STAGE_SCORE_QUEUE = 'stage-score';
export const SANDBOX_DONE_QUEUE = 'sandbox-done';
export const SESSION_FINALIZE_QUEUE = SCORING_QUEUE;

export interface StageScoreJob {
  stage_attempt_id: string;
  session_id: string;
  stage_key: string;
  reason?: 'stage_completed' | 'sandbox_done' | 'manual_rescore' | 'transcribe_poll' | 'calibration';
  transcribe_job?: string;
}

export interface SandboxDoneJob {
  stage_attempt_id: string;
  session_id: string;
  stage_key: string;
}
