import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { SCORING_QUEUE, type ScoringJob } from '@cap/shared/queues';

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

export async function enqueueScoring(job: ScoringJob): Promise<string | null> {
  const q = getScoringQueue();
  if (!q) return null;
  // jobId de-dupes burst triggers from the same session in the same reason bucket.
  const jobId = `${job.session_id}:${job.reason}:${Date.now()}`;
  await q.add('score', job, {
    jobId,
    removeOnComplete: { age: 3600, count: 1000 },
    removeOnFail: { age: 24 * 3600 },
    attempts: 3,
    backoff: { type: 'exponential', delay: 5_000 },
  });
  return jobId;
}
