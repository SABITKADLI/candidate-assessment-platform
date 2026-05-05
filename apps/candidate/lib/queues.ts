import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import {
  SCORING_QUEUE,
  SANDBOX_QUEUE,
  STAGE_SCORE_QUEUE,
  type ScoringJob,
  type StageScoreJob,
} from '@cap/shared/queues';
import type { Language } from './coding-problems';

// Lazy singletons. If REDIS_URL is missing we return a no-op that logs a
// warning, so local dev without Redis doesn't 500 stage-completion requests.
declare global {
  // eslint-disable-next-line no-var
  var __cap_scoring_queue: Queue<ScoringJob> | null | undefined;
  // eslint-disable-next-line no-var
  var __cap_scoring_redis: Redis | undefined;
}

function make(): Queue<ScoringJob> | null {
  const url = process.env.REDIS_URL;
  if (!url) {
    console.warn('[queues] REDIS_URL unset — scoring jobs will not be enqueued');
    return null;
  }
  const connection = globalThis.__cap_scoring_redis
    ?? (globalThis.__cap_scoring_redis = new Redis(url, { maxRetriesPerRequest: null }));
  return new Queue<ScoringJob>(SCORING_QUEUE, { connection });
}

export function getScoringQueue(): Queue<ScoringJob> | null {
  if (globalThis.__cap_scoring_queue !== undefined) return globalThis.__cap_scoring_queue;
  globalThis.__cap_scoring_queue = make();
  return globalThis.__cap_scoring_queue;
}

// ── Sandbox queue ─────────────────────────────────────────────────────────────

export interface SandboxJobData {
  stage_attempt_id: string;
  session_id: string;
  stage_key: string;
  run: {
    id: string;
    language: Language;
    files: Array<{ path: string; content: string; mode?: number }>;
    tests: Array<{ path: string; content: string; mode?: number }>;
    test_cmd: string[];
    timeout_ms: number;
    memory_mb: number;
    env?: Record<string, string>;
  };
}

declare global {
  // eslint-disable-next-line no-var
  var __cap_sandbox_queue: Queue<SandboxJobData> | null | undefined;
  // eslint-disable-next-line no-var
  var __cap_stage_score_queue: Queue<StageScoreJob> | null | undefined;
}

function makeSandboxQueue(): Queue<SandboxJobData> | null {
  const url = process.env.REDIS_URL;
  if (!url) {
    console.warn('[queues] REDIS_URL unset — sandbox jobs will not be enqueued');
    return null;
  }
  const connection = globalThis.__cap_scoring_redis
    ?? (globalThis.__cap_scoring_redis = new Redis(url, { maxRetriesPerRequest: null }));
  return new Queue<SandboxJobData>(SANDBOX_QUEUE, { connection });
}

export function getSandboxQueue(): Queue<SandboxJobData> | null {
  if (globalThis.__cap_sandbox_queue !== undefined) return globalThis.__cap_sandbox_queue;
  globalThis.__cap_sandbox_queue = makeSandboxQueue();
  return globalThis.__cap_sandbox_queue;
}

export async function enqueueSandbox(job: SandboxJobData): Promise<string | null> {
  const q = getSandboxQueue();
  if (!q) return null;
  const jobId = `sandbox-${job.stage_attempt_id}`;
  await q.add('run', job, {
    jobId,
    removeOnComplete: { age: 3600 * 24, count: 5000 },
    removeOnFail: { age: 3600 * 48 },
    attempts: 2,
    backoff: { type: 'exponential', delay: 3_000 },
  });
  return jobId;
}

// ── Scoring queue ─────────────────────────────────────────────────────────────

export async function enqueueScoring(job: ScoringJob): Promise<string | null> {
  const q = getScoringQueue();
  if (!q) return null;
  // jobId de-dupes burst triggers from the same session in the same reason bucket.
  const jobId = `score-${job.session_id}-${job.reason}-${Date.now()}`;
  await q.add('score', job, {
    jobId,
    removeOnComplete: { age: 3600, count: 1000 },
    removeOnFail: { age: 24 * 3600 },
    attempts: 3,
    backoff: { type: 'exponential', delay: 5_000 },
  });
  return jobId;
}

// Stage-score queue consumed by the scoring-worker grader engine.
function makeStageScoreQueue(): Queue<StageScoreJob> | null {
  const url = process.env.REDIS_URL;
  if (!url) {
    console.warn('[queues] REDIS_URL unset - stage-score jobs will not be enqueued');
    return null;
  }
  const connection = globalThis.__cap_scoring_redis
    ?? (globalThis.__cap_scoring_redis = new Redis(url, { maxRetriesPerRequest: null }));
  return new Queue<StageScoreJob>(process.env.STAGE_SCORE_QUEUE ?? STAGE_SCORE_QUEUE, { connection });
}

export function getStageScoreQueue(): Queue<StageScoreJob> | null {
  if (globalThis.__cap_stage_score_queue !== undefined) return globalThis.__cap_stage_score_queue;
  globalThis.__cap_stage_score_queue = makeStageScoreQueue();
  return globalThis.__cap_stage_score_queue;
}

export async function enqueueStageScore(job: StageScoreJob): Promise<string | null> {
  const q = getStageScoreQueue();
  if (!q) return null;
  const jobId = `stage-score-${job.stage_attempt_id}-${Date.now()}`;
  await q.add('grade', job, {
    jobId,
    removeOnComplete: { age: 3600 * 24, count: 5000 },
    removeOnFail: { age: 3600 * 48 },
    attempts: 3,
    backoff: { type: 'exponential', delay: 5_000 },
  });
  return jobId;
}
