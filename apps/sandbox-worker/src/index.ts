if (!process.env.DATABASE_URL || !process.env.REDIS_URL || !process.env.SANDBOX_IMAGE) {
  console.warn('[sandbox-worker] DATABASE_URL/REDIS_URL/SANDBOX_IMAGE unset — skipping dev boot');
  process.exit(0);
}

import { Worker, type Job } from 'bullmq';
import { Redis } from 'ioredis';
import pino from 'pino';
import { z } from 'zod';
import { sql, auditLog } from '@cap/db';
import { zStageKey } from '@cap/shared';
import { runSandbox } from './docker.js';
import type { RunRequest } from './protocol.js';

// ---- Job schema (producer contract) -----------------------------------------
const zJob = z.object({
  stage_attempt_id: z.string().uuid(),
  session_id: z.string().uuid(),
  stage_key: zStageKey,
  run: z.object({
    id: z.string().uuid(),
    language: z.enum(['python', 'node']),
    files: z.array(z.object({ path: z.string(), content: z.string(), mode: z.number().optional() })),
    tests: z.array(z.object({ path: z.string(), content: z.string(), mode: z.number().optional() })),
    test_cmd: z.array(z.string()).min(1),
    timeout_ms: z.number().int().min(1_000).max(120_000),
    memory_mb: z.number().int().min(64).max(2048),
    env: z.record(z.string(), z.string()).optional(),
  }),
});
type JobData = z.infer<typeof zJob>;

// ---- Wiring -----------------------------------------------------------------
const log = pino({ level: process.env.LOG_LEVEL ?? 'info' });
const IMAGE     = requireEnv('SANDBOX_IMAGE');
const SECCOMP   = process.env.SANDBOX_SECCOMP_PATH;   // absolute path on host
const RUNTIME   = (process.env.SANDBOX_RUNTIME ?? 'runsc') as 'runsc' | 'runc';
const REDIS_URL = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379';
const QUEUE     = process.env.SANDBOX_QUEUE ?? 'sandbox-runs';
const CONCURRENCY = Number(process.env.SANDBOX_CONCURRENCY ?? 2);

const connection = new Redis(REDIS_URL, { maxRetriesPerRequest: null });
const stopHeartbeat = startWorkerHeartbeat();

const worker = new Worker<JobData>(
  QUEUE,
  async (job: Job) => {
    const parsed = zJob.safeParse(job.data);
    if (!parsed.success) throw new Error(`invalid job: ${parsed.error.message}`);
    const { stage_attempt_id, session_id, stage_key, run } = parsed.data;

    await auditLog('sandbox-worker', 'sandbox.run.start',
      `stage_attempt:${stage_attempt_id}`, { stage_key, job_id: job.id });

    const req: RunRequest = run;
    const outcome = await runSandbox(req, {
      image: IMAGE,
      runtime: RUNTIME,
      seccompPath: SECCOMP,
      memoryMb: run.memory_mb,
      cpus: 1,
      pidsLimit: 128,
      network: 'none',
    });

    const sandboxScore = computeSandboxScore(outcome.result, outcome.oom_killed);

    // Persist: keep raw result blob on stage_attempts for forensics; update timing.
    await sql`
      UPDATE app.stage_attempts
         SET raw_payload = raw_payload || ${sql.json({
           sandbox: {
             timed_out: outcome.result.timed_out,
             oom_killed: outcome.oom_killed,
             exit_code: outcome.result.exit_code,
             wall_ms: outcome.wall_ms,
             stdout: outcome.result.stdout,
             stderr: outcome.result.stderr,
             tests: outcome.result.tests ?? null,
             error: outcome.result.error ?? null,
           },
         } as never)},
             score        = ${sandboxScore},
             duration_s   = ${Math.round(outcome.wall_ms / 1000)},
             completed_at = now()
       WHERE id = ${stage_attempt_id}::uuid
    `;

    await auditLog('sandbox-worker', 'sandbox.run.done',
      `stage_attempt:${stage_attempt_id}`, {
        exit_code: outcome.result.exit_code,
        timed_out: outcome.result.timed_out,
        oom_killed: outcome.oom_killed,
        wall_ms: outcome.wall_ms,
        host_error: outcome.host_error ?? null,
      });

    log.info({ stage_attempt_id, session_id, stage_key,
               timed_out: outcome.result.timed_out,
               oom: outcome.oom_killed,
               ms: outcome.wall_ms }, 'sandbox.done');

    return {
      stage_attempt_id,
      timed_out: outcome.result.timed_out,
      oom_killed: outcome.oom_killed,
      tests: outcome.result.tests ?? null,
    };
  },
  {
    connection,
    concurrency: CONCURRENCY,
    // BullMQ will run the job regardless of timeout; sandbox enforces its own.
    lockDuration: 150_000,
  },
);

worker.on('failed', (job, err) => log.error({ jobId: job?.id, err: err.message }, 'job.failed'));
worker.on('error',  (err) => log.error({ err: err.message }, 'worker.error'));

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, async () => {
    log.info({ sig }, 'shutting down');
    stopHeartbeat();
    await worker.close();
    await connection.quit();
    process.exit(0);
  });
}

function startWorkerHeartbeat() {
  const startedAt = new Date().toISOString();
  const key = 'cap:health:worker:sandbox';

  async function beat() {
    try {
      await connection.set(key, JSON.stringify({
        worker: 'sandbox',
        queue: QUEUE,
        concurrency: CONCURRENCY,
        started_at: startedAt,
        heartbeat_at: new Date().toISOString(),
        runtime: RUNTIME,
        image: IMAGE,
        config: {
          database_url_present: Boolean(process.env.DATABASE_URL),
          redis_url_present: Boolean(process.env.REDIS_URL),
          sandbox_image_present: Boolean(process.env.SANDBOX_IMAGE),
          sandbox_runtime: RUNTIME,
          sandbox_seccomp_path_present: Boolean(process.env.SANDBOX_SECCOMP_PATH),
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

function requireEnv(k: string): string {
  const v = process.env[k];
  if (!v) throw new Error(`${k} not set`);
  return v;
}

function computeSandboxScore(result: import('./protocol.js').RunResult, oomKilled: boolean): number {
  if (oomKilled || result.timed_out) return 0;
  if (result.tests && result.tests.total > 0) {
    return Math.round((result.tests.passed / result.tests.total) * 100 * 1000) / 1000;
  }
  return result.exit_code === 0 ? 100 : 0;
}
