import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { SCORING_QUEUE, type ScoringJob } from '@cap/shared/queues';

declare global {
  // eslint-disable-next-line no-var
  var __cap_recruiter_redis: Redis | undefined;
  // eslint-disable-next-line no-var
  var __cap_recruiter_scoring_queue: Queue<ScoringJob> | null | undefined;
}

function getQueue(): Queue<ScoringJob> | null {
  if (globalThis.__cap_recruiter_scoring_queue !== undefined) return globalThis.__cap_recruiter_scoring_queue;
  const url = process.env.REDIS_URL;
  if (!url) {
    globalThis.__cap_recruiter_scoring_queue = null;
    return null;
  }
  const connection = globalThis.__cap_recruiter_redis
    ?? (globalThis.__cap_recruiter_redis = new Redis(url, { maxRetriesPerRequest: null }));
  globalThis.__cap_recruiter_scoring_queue = new Queue<ScoringJob>(process.env.SCORING_QUEUE ?? SCORING_QUEUE, { connection });
  return globalThis.__cap_recruiter_scoring_queue;
}

export async function enqueueSessionFinalize(job: ScoringJob): Promise<string | null> {
  const queue = getQueue();
  if (!queue) return null;
  const jobId = `finalize-${job.session_id}-${job.reason}-${Date.now()}`;
  await queue.add('score', job, {
    jobId,
    removeOnComplete: { age: 3600, count: 1000 },
    removeOnFail: { age: 24 * 3600 },
    attempts: 3,
    backoff: { type: 'exponential', delay: 5_000 },
  });
  return jobId;
}
