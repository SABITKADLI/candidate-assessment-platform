if (!process.env.DATABASE_URL || !process.env.REDIS_URL) {
  console.warn('[scoring-worker] DATABASE_URL/REDIS_URL unset — skipping dev boot');
  process.exit(0);
}

import { Worker, type Job } from 'bullmq';
import { Redis } from 'ioredis';
import pino from 'pino';
import { z } from 'zod';
import { sql, auditLog } from '@cap/db';
import { computeComposite } from './composite.js';
import { generateMemo } from './memo.js';
import { enqueueAts, type AtsProvider } from './ats.js';
import { startOutboxLoop } from './outbox.js';

// Job contract: "please (re)score this session and optionally push to ATS".
// Triggered by: stage completion handler in the candidate app.
const zJob = z.object({
  session_id: z.string().uuid(),
  reason: z.enum(['stage_completed', 'manual_rescore', 'recruiter_action']),
  ats: z.array(z.enum(['greenhouse', 'lever', 'workday'])).optional(),
});
type JobData = z.infer<typeof zJob>;

const log = pino({ level: process.env.LOG_LEVEL ?? 'info' });
const QUEUE = process.env.SCORING_QUEUE ?? 'scoring-runs';
const CONCURRENCY = Number(process.env.SCORING_CONCURRENCY ?? 4);
const SKIP_MEMO = !process.env.ANTHROPIC_API_KEY;
if (SKIP_MEMO) log.warn('ANTHROPIC_API_KEY unset — memo generation disabled');

const connection = new Redis(process.env.REDIS_URL!, { maxRetriesPerRequest: null });

const worker = new Worker<JobData>(
  QUEUE,
  async (job: Job) => {
    const { session_id, reason, ats } = zJob.parse(job.data);
    const t0 = Date.now();

    const composite = await computeComposite({ session_id });
    log.info({ session_id, composite: composite.composite, reason }, 'composite.done');

    // Persist composite regardless of memo success (memo can be retried later).
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

    // Memo — optional. Don't fail the job if Anthropic is down; leave memo null.
    let memo = null;
    if (!SKIP_MEMO) {
      try {
        memo = await generateMemo({ session_id, composite });
        if (memo.s3_key) {
          await sql`
            UPDATE app.scores SET memo_s3_key = ${memo.s3_key} WHERE session_id = ${session_id}::uuid
          `;
        }
        await auditLog('scoring-worker', 'memo.generate',
          `session:${session_id}`, { recommendation: memo.recommendation, s3: !!memo.s3_key });
      } catch (e) {
        log.error({ session_id, err: String(e) }, 'memo.failed');
        await auditLog('scoring-worker', 'memo.failed',
          `session:${session_id}`, { err: String(e).slice(0, 256) });
      }
    }

    // ATS push — same transaction model: enqueue rows, outbox loop delivers.
    if (ats?.length && memo) {
      for (const provider of ats) {
        await enqueueAts({ session_id, ats: provider as AtsProvider, composite, memo });
      }
    }

    return { session_id, composite: composite.composite, memo_s3_key: memo?.s3_key ?? null, ms: Date.now() - t0 };
  },
  { connection, concurrency: CONCURRENCY, lockDuration: 120_000 },
);

worker.on('failed', (j, err) => log.error({ id: j?.id, err: err.message }, 'scoring.failed'));
worker.on('error',  (err) => log.error({ err: err.message }, 'worker.error'));

// Outbox dispatcher runs in-process. Single instance is fine for MVP; scaling
// horizontally is safe because drain() uses SELECT ... FOR UPDATE SKIP LOCKED.
const stopOutbox = startOutboxLoop(Number(process.env.OUTBOX_INTERVAL_MS ?? 5000));

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, async () => {
    log.info({ sig }, 'shutting down');
    stopOutbox();
    await worker.close();
    await connection.quit();
    process.exit(0);
  });
}
