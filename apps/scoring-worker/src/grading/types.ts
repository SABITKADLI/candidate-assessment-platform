import type { Queue } from 'bullmq';
import type { Redis } from 'ioredis';
import type { GraderResult, ReconcileOutput } from '@cap/graders';
import type { ScoringJob, StageScoreJob } from '@cap/shared/queues';

export interface StageAttemptRow {
  id: string;
  session_id: string;
  stage_key: string;
  raw_payload: Record<string, unknown>;
  duration_s: number | null;
  completed_at: Date | null;
  scoring_status: string;
  scoring_error: string | null;
  role_name: string | null;
  role_description: string | null;
  session_locale: string | null;
}

export interface RunDraft {
  pass_no: 1 | 2;
  grader_version: string;
  model: string;
  result: GraderResult;
  prompt_hash: string;
  raw_response?: string;
  input_token_count?: number;
  output_token_count?: number;
  latency_ms?: number;
}

export interface GradeOutcome {
  primary?: RunDraft;
  verifier?: RunDraft;
  reconciliation?: ReconcileOutput;
  pending?: boolean;
  pending_delay_ms?: number;
  pending_reason?: string;
}

export interface GraderContext {
  stageQueue: Queue<StageScoreJob>;
  finalizeQueue: Queue<ScoringJob>;
  redis: Redis;
}

export interface StageGrader {
  version: string;
  grade(attempt: StageAttemptRow, ctx: GraderContext): Promise<GradeOutcome>;
}
