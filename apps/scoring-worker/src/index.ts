if (!process.env.DATABASE_URL || !process.env.REDIS_URL) {
  console.warn('[scoring-worker] DATABASE_URL/REDIS_URL unset - skipping dev boot');
  process.exit(0);
}

import { Queue, Worker, type Job } from 'bullmq';
import { Redis } from 'ioredis';
import pino from 'pino';
import { z } from 'zod';
import { sql, auditLog } from '@cap/db';
import { zStageKey } from '@cap/shared';
import {
  SANDBOX_DONE_QUEUE,
  STAGE_SCORE_QUEUE,
  type ScoringJob,
  type StageScoreJob,
} from '@cap/shared/queues';
import { computeComposite } from './composite.js';
import { generateMemo } from './memo.js';
import { enqueueAts, type AtsProvider } from './ats.js';
import { startOutboxLoop } from './outbox.js';
import { processSandboxDone, processStageScore, sessionReadyForFinalization } from './grading/processor.js';

const zJob = z.object({
  session_id: z.string().uuid(),
  reason: z.enum(['stage_completed', 'manual_rescore', 'recruiter_action']),
  ats: z.array(z.enum(['greenhouse', 'lever', 'workday'])).optional(),
});
type JobData = z.infer<typeof zJob>;

const zStageScoreJob = z.object({
  stage_attempt_id: z.string().uuid(),
  session_id: z.string().uuid(),
  stage_key: zStageKey,
  reason: z.enum(['stage_completed', 'sandbox_done', 'manual_rescore', 'transcribe_poll', 'calibration']).optional(),
  transcribe_job: z.string().optional(),
});

const log = pino({ level: process.env.LOG_LEVEL ?? 'info' });
const QUEUE = process.env.SCORING_QUEUE ?? 'scoring-runs';
const STAGE_QUEUE = process.env.STAGE_SCORE_QUEUE ?? STAGE_SCORE_QUEUE;
const SANDBOX_DONE = process.env.SANDBOX_DONE_QUEUE ?? SANDBOX_DONE_QUEUE;
const CONCURRENCY = Number(process.env.SCORING_CONCURRENCY ?? 4);
const GRADER_CONCURRENCY = Number(process.env.GRADER_CONCURRENCY ?? 4);
const SKIP_MEMO = !process.env.ANTHROPIC_API_KEY;
if (SKIP_MEMO) log.warn('ANTHROPIC_API_KEY unset - memo generation disabled');

const connection = new Redis(process.env.REDIS_URL!, { maxRetriesPerRequest: null });
const stageQueue = new Queue<StageScoreJob>(STAGE_QUEUE, { connection });
const finalizeQueue = new Queue<ScoringJob>(QUEUE, { connection });
const stopHeartbeat = startWorkerHeartbeat();

const finalizeWorker = new Worker<JobData>(
  QUEUE,
  async (job: Job) => {
    const { session_id, reason, ats } = zJob.parse(job.data);
    const t0 = Date.now();

    if (!(await sessionReadyForFinalization(session_id))) {
      log.info({ session_id, reason }, 'finalize.skipped.waiting_for_stage_scores');
      return { session_id, skipped: 'waiting_for_stage_scores', ms: Date.now() - t0 };
    }

    const composite = await computeComposite({ session_id });
    log.info({ session_id, composite: composite.composite, reason }, 'composite.done');

    await sql`
      INSERT INTO app.scores (session_id, composite, per_stage, proctoring_mult,
                              weights_version, computed_at)
      VALUES (${session_id}::uuid, ${composite.composite}, ${sql.json(composite.per_stage as never)},
              ${composite.proctoring_mult}, ${composite.weights_version}, now())
      ON CONFLICT (session_id) DO UPDATE
        SET composite = EXCLUDED.composite,
            per_stage = EXCLUDED.per_stage,
            proctoring_mult = EXCLUDED.proctoring_mult,
            weights_version = EXCLUDED.weights_version,
            computed_at = now()
    `;
    await auditLog('scoring-worker', 'score.compute',
      `session:${session_id}`, { reason, composite: composite.composite });

    let memo = null;
    if (!SKIP_MEMO) {
      try {
        memo = await generateMemo({ session_id, composite });
        await sql`
          UPDATE app.scores
          SET memo_text       = ${memo.markdown},
              recommendation  = ${memo.recommendation},
              memo_s3_key     = ${memo.s3_key ?? null}
          WHERE session_id = ${session_id}::uuid
        `;
        await auditLog('scoring-worker', 'memo.generate',
          `session:${session_id}`, { recommendation: memo.recommendation, s3: !!memo.s3_key });
      } catch (e) {
        log.error({ session_id, err: String(e) }, 'memo.failed');
        await auditLog('scoring-worker', 'memo.failed',
          `session:${session_id}`, { err: String(e).slice(0, 256) });
      }
    }

    if (ats?.length && memo) {
      for (const provider of ats) {
        await enqueueAts({ session_id, ats: provider as AtsProvider, composite, memo });
      }
    }

    return { session_id, composite: composite.composite, memo_s3_key: memo?.s3_key ?? null, ms: Date.now() - t0 };
  },
  { connection, concurrency: CONCURRENCY, lockDuration: 120_000 },
);

finalizeWorker.on('failed', (j, err) => log.error({ id: j?.id, err: err.message }, 'scoring.failed'));
finalizeWorker.on('error',  (err) => log.error({ err: err.message }, 'worker.error'));

const stageWorker = new Worker<StageScoreJob>(
  STAGE_QUEUE,
  async (job: Job) => {
    const parsed = zStageScoreJob.parse(job.data);
    const t0 = Date.now();
    const result = await processStageScore(parsed, { stageQueue, finalizeQueue, redis: connection });
    log.info({
      stage_attempt_id: parsed.stage_attempt_id,
      session_id: parsed.session_id,
      stage_key: parsed.stage_key,
      ...result,
      latency_ms: Date.now() - t0,
    }, 'stage_score.done');
    return result;
  },
  { connection, concurrency: GRADER_CONCURRENCY, lockDuration: 180_000 },
);

stageWorker.on('failed', (j, err) => log.error({ id: j?.id, err: err.message }, 'stage_score.failed'));
stageWorker.on('error',  (err) => log.error({ err: err.message }, 'stage_worker.error'));

const sandboxDoneWorker = new Worker<StageScoreJob>(
  SANDBOX_DONE,
  async (job: Job) => {
    const parsed = zStageScoreJob.parse({ ...job.data, reason: 'sandbox_done' });
    return processSandboxDone(parsed, { stageQueue, finalizeQueue, redis: connection });
  },
  { connection, concurrency: GRADER_CONCURRENCY, lockDuration: 60_000 },
);

sandboxDoneWorker.on('failed', (j, err) => log.error({ id: j?.id, err: err.message }, 'sandbox_done.failed'));
sandboxDoneWorker.on('error',  (err) => log.error({ err: err.message }, 'sandbox_done_worker.error'));

const stopOutbox = startOutboxLoop(Number(process.env.OUTBOX_INTERVAL_MS ?? 5000));

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, async () => {
    log.info({ sig }, 'shutting down');
    stopHeartbeat();
    stopOutbox();
    await sandboxDoneWorker.close();
    await stageWorker.close();
    await finalizeWorker.close();
    await stageQueue.close();
    await finalizeQueue.close();
    await connection.quit();
    process.exit(0);
  });
}

function startWorkerHeartbeat() {
  const startedAt = new Date().toISOString();
  const key = 'cap:health:worker:scoring';

  async function beat() {
    try {
      await connection.set(key, JSON.stringify({
        worker: 'scoring',
        queue: QUEUE,
        stage_queue: STAGE_QUEUE,
        sandbox_done_queue: SANDBOX_DONE,
        concurrency: CONCURRENCY,
        grader_concurrency: GRADER_CONCURRENCY,
        started_at: startedAt,
        heartbeat_at: new Date().toISOString(),
        memo_model: process.env.MEMO_MODEL ?? 'claude-sonnet-4-20250514',
        grader_model: process.env.GRADER_MODEL ?? 'claude-sonnet-4-20250514',
        config: {
          database_url_present: Boolean(process.env.DATABASE_URL),
          redis_url_present: Boolean(process.env.REDIS_URL),
          anthropic_api_key_present: Boolean(process.env.ANTHROPIC_API_KEY),
          grader_verifier_enabled: process.env.GRADER_VERIFIER_ENABLED !== 'false',
          grader_shadow: process.env.GRADER_SHADOW === 'true',
          aws_region: process.env.AWS_REGION ?? '',
          s3_bucket_present: Boolean(process.env.S3_BUCKET),
          aws_access_key_id_present: Boolean(process.env.AWS_ACCESS_KEY_ID),
          aws_secret_access_key_present: Boolean(process.env.AWS_SECRET_ACCESS_KEY),
          ats_greenhouse_configured: Boolean(process.env.ATS_GREENHOUSE_URL && process.env.ATS_GREENHOUSE_SECRET),
          ats_lever_configured: Boolean(process.env.ATS_LEVER_URL && process.env.ATS_LEVER_SECRET),
          ats_workday_configured: Boolean(process.env.ATS_WORKDAY_URL && process.env.ATS_WORKDAY_SECRET),
        },
      }), 'EX', 90);
    } catch (err) {
      log.warn({ err: String(err) }, 'heartbeat.failed');
    }
  }

  void beat();
  const timer = setInterval(() => void beat(), 30_000);
  return () => clearInterval(timer);
}
