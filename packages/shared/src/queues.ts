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
