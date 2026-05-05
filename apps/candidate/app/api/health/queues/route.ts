import { GetBucketCorsCommand, HeadObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { sql } from '@cap/db';
import {
  diagnosticsOk,
  summarizeDiagnostics,
  type DiagnosticCheck,
  type DiagnosticField,
  type DiagnosticsResponse,
  type DiagnosticStatus,
} from '@cap/shared/diagnostics';
import { SANDBOX_QUEUE, SCORING_QUEUE } from '@cap/shared/queues';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const CHECK_TIMEOUT_MS = 8_000;
const WORKER_HEARTBEAT_TTL_S = 120;

export async function GET(req: Request) {
  const diagnosticsSecret = process.env.DIAGNOSTICS_SECRET;
  if (diagnosticsSecret && req.headers.get('x-cap-diagnostics-secret') !== diagnosticsSecret) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }

  const origin = new URL(req.url).origin;
  const checks = await Promise.all([
    checkCandidateEnv(),
    withTimeout(checkDatabase(), 'assessment.db', 'Database', 'database'),
    withTimeout(checkRedis(), 'assessment.redis', 'Redis', 'queue'),
    withTimeout(checkQueue(process.env.SCORING_QUEUE ?? SCORING_QUEUE, 'scoring'), 'assessment.queue.scoring', 'Scoring queue', 'queue'),
    withTimeout(checkQueue(process.env.SANDBOX_QUEUE ?? SANDBOX_QUEUE, 'sandbox'), 'assessment.queue.sandbox', 'Sandbox queue', 'queue'),
    withTimeout(checkWorkerHeartbeat('cap:health:worker:scoring', 'Scoring worker'), 'assessment.worker.scoring', 'Scoring worker', 'worker'),
    withTimeout(checkWorkerHeartbeat('cap:health:worker:sandbox', 'Sandbox worker'), 'assessment.worker.sandbox', 'Sandbox worker', 'worker'),
    withTimeout(checkS3Access(), 'assessment.s3.access', 'S3 object access', 'storage'),
    withTimeout(checkS3Cors(origin), 'assessment.s3.cors', 'S3 CORS', 'storage'),
    withTimeout(checkTurnstile(), 'assessment.turnstile', 'Turnstile', 'external-api'),
  ]);

  const flatChecks = checks.flat();
  const response: DiagnosticsResponse = {
    service: 'assessment',
    generated_at: new Date().toISOString(),
    ok: diagnosticsOk(flatChecks),
    summary: summarizeDiagnostics(flatChecks),
    checks: flatChecks,
  };

  return Response.json(response, { status: response.ok ? 200 : 503 });
}

function checkCandidateEnv(): DiagnosticCheck[] {
  const required = [
    'DATABASE_URL',
    'REDIS_URL',
    'AWS_REGION',
    'S3_BUCKET',
    'AWS_ACCESS_KEY_ID',
    'AWS_SECRET_ACCESS_KEY',
    'NEXT_PUBLIC_TURNSTILE_SITE_KEY',
    'TURNSTILE_SECRET_KEY',
    'CRON_SECRET',
  ];
  const missing = required.filter((key) => !process.env[key]);
  const fields: DiagnosticField[] = required.map((key) => ({
    label: key,
    value: process.env[key] ? 'set' : 'missing',
    tone: process.env[key] ? 'ok' : 'fail',
  }));

  return [{
    id: 'assessment.env',
    scope: 'assessment-runtime',
    label: 'Assessment environment',
    status: missing.length ? 'fail' : 'ok',
    required: true,
    summary: missing.length ? `${missing.length} required env var(s) missing` : 'Required assessment env vars are present',
    detail: missing.length ? `Missing: ${missing.join(', ')}` : undefined,
    fields,
  }];
}

async function checkDatabase(): Promise<DiagnosticCheck[]> {
  const started = Date.now();
  const [probe] = await sql<Array<{ ok: number }>>`SELECT 1 AS ok`;
  const [migration] = await sql<Array<{ version: string; name: string; applied_at: string }>>`
    SELECT version, name, applied_at::text AS applied_at
    FROM app.schema_migrations
    ORDER BY version DESC
    LIMIT 1
  `;
  const [gma] = await sql<Array<{ active_items: number }>>`
    SELECT count(*)::int AS active_items
    FROM app.gma_items
    WHERE active = true
  `;

  const activeItems = Number(gma?.active_items ?? 0);
  const status: DiagnosticStatus = probe?.ok === 1 && activeItems >= 50 ? 'ok' : 'warn';
  return [{
    id: 'assessment.db',
    scope: 'database',
    label: 'Assessment database',
    status,
    required: true,
    summary: status === 'ok' ? 'Database reachable and GMA bank is production-sized' : 'Database reachable, but content checks need review',
    detail: migration ? `Latest migration ${migration.version}_${migration.name}` : 'schema_migrations has no applied rows',
    latency_ms: Date.now() - started,
    fields: [
      { label: 'latest_migration', value: migration ? `${migration.version}_${migration.name}` : 'none', tone: migration ? 'ok' : 'warn' },
      { label: 'active_gma_items', value: activeItems, tone: activeItems >= 50 ? 'ok' : 'warn' },
    ],
  }];
}

async function checkRedis(): Promise<DiagnosticCheck[]> {
  const url = process.env.REDIS_URL;
  if (!url) {
    return [{
      id: 'assessment.redis',
      scope: 'queue',
      label: 'Redis',
      status: 'fail',
      required: true,
      summary: 'REDIS_URL is not set',
    }];
  }

  const redis = makeRedis(url);
  const started = Date.now();
  try {
    await redis.connect();
    const pong = await redis.ping();
    return [{
      id: 'assessment.redis',
      scope: 'queue',
      label: 'Redis',
      status: pong === 'PONG' ? 'ok' : 'fail',
      required: true,
      summary: pong === 'PONG' ? 'Redis accepted PING' : `Redis returned ${pong}`,
      latency_ms: Date.now() - started,
      fields: [
        { label: 'url', value: safeRedisUrl(url), tone: 'ok' },
        { label: 'ping', value: pong, tone: pong === 'PONG' ? 'ok' : 'fail' },
      ],
    }];
  } finally {
    redis.disconnect();
  }
}

async function checkQueue(queueName: string, kind: 'scoring' | 'sandbox'): Promise<DiagnosticCheck[]> {
  const url = process.env.REDIS_URL;
  if (!url) {
    return [skipCheck(`assessment.queue.${kind}`, 'queue', `${title(kind)} queue`, 'REDIS_URL is not set')];
  }

  const connection = new Redis(url, {
    maxRetriesPerRequest: null,
    connectTimeout: 5_000,
  });
  connection.on('error', () => undefined);

  const queue = new Queue(queueName, { connection });
  const started = Date.now();
  try {
    const [counts, workers] = await Promise.all([
      queue.getJobCounts('waiting', 'active', 'delayed', 'failed', 'completed'),
      queue.getWorkersCount(),
    ]);
    const failed = Number(counts.failed ?? 0);
    const waiting = Number(counts.waiting ?? 0);
    const status: DiagnosticStatus = workers < 1 ? 'fail' : failed > 0 ? 'warn' : 'ok';

    return [{
      id: `assessment.queue.${kind}`,
      scope: 'queue',
      label: `${title(kind)} queue`,
      status,
      required: true,
      summary: workers < 1
        ? `No active ${kind} worker registered`
        : failed > 0
          ? `${workers} worker(s), ${failed} failed job(s)`
          : `${workers} worker(s) registered`,
      detail: workers < 1
        ? `Start the ${kind} Docker worker with the same REDIS_URL and queue name.`
        : undefined,
      latency_ms: Date.now() - started,
      fields: [
        { label: 'queue', value: queueName, tone: 'ok' },
        { label: 'workers', value: workers, tone: workers > 0 ? 'ok' : 'fail' },
        { label: 'waiting', value: waiting, tone: waiting > 0 ? 'warn' : 'ok' },
        { label: 'active', value: Number(counts.active ?? 0), tone: 'ok' },
        { label: 'failed', value: failed, tone: failed > 0 ? 'warn' : 'ok' },
      ],
    }];
  } finally {
    await queue.close().catch(() => undefined);
    connection.disconnect();
  }
}

async function checkWorkerHeartbeat(key: string, label: string): Promise<DiagnosticCheck[]> {
  const url = process.env.REDIS_URL;
  if (!url) return [skipCheck(key, 'worker', label, 'REDIS_URL is not set')];

  const redis = makeRedis(url);
  const started = Date.now();
  try {
    await redis.connect();
    const raw = await redis.get(key);
    if (!raw) {
      return [{
        id: key,
        scope: 'worker',
        label,
        status: 'warn',
        required: true,
        summary: 'No worker heartbeat found',
        detail: 'Workers may be running old code, stopped, or connected to a different Redis database.',
        latency_ms: Date.now() - started,
      }];
    }

    const heartbeat = parseHeartbeat(raw);
    const heartbeatAt = typeof heartbeat.heartbeat_at === 'string' ? heartbeat.heartbeat_at : undefined;
    const ageSeconds = heartbeatAt
      ? Math.round((Date.now() - Date.parse(heartbeatAt)) / 1000)
      : Number.POSITIVE_INFINITY;
    const stale = !Number.isFinite(ageSeconds) || ageSeconds > WORKER_HEARTBEAT_TTL_S;

    return [{
      id: key,
      scope: 'worker',
      label,
      status: stale ? 'fail' : 'ok',
      required: true,
      summary: stale ? `Heartbeat stale (${ageSeconds}s old)` : `Heartbeat fresh (${ageSeconds}s old)`,
      latency_ms: Date.now() - started,
      fields: heartbeatFields(heartbeat, ageSeconds),
    }];
  } finally {
    redis.disconnect();
  }
}

async function checkS3Access(): Promise<DiagnosticCheck[]> {
  const missing = ['AWS_REGION', 'S3_BUCKET', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY'].filter((key) => !process.env[key]);
  if (missing.length) {
    return [skipCheck('assessment.s3.access', 'storage', 'S3 object access', `Missing: ${missing.join(', ')}`)];
  }

  const bucket = process.env.S3_BUCKET!;
  const started = Date.now();
  try {
    await s3().send(new HeadObjectCommand({
      Bucket: bucket,
      Key: `_healthcheck/not-created-${crypto.randomUUID()}`,
    }));
    return [{
      id: 'assessment.s3.access',
      scope: 'storage',
      label: 'S3 object access',
      status: 'warn',
      required: true,
      summary: 'Diagnostic object unexpectedly exists',
      latency_ms: Date.now() - started,
      fields: s3Fields(bucket),
    }];
  } catch (err) {
    const statusCode = awsStatusCode(err);
    const notFound = statusCode === 404 || ['NotFound', 'NoSuchKey'].includes(awsErrorName(err));
    return [{
      id: 'assessment.s3.access',
      scope: 'storage',
      label: 'S3 object access',
      status: notFound ? 'ok' : 'fail',
      required: true,
      summary: notFound ? 'S3 credentials can reach the bucket' : `S3 rejected the request (${awsPublicError(err)})`,
      detail: notFound ? 'The 404 is expected because the health object is intentionally not created.' : undefined,
      latency_ms: Date.now() - started,
      fields: s3Fields(bucket),
    }];
  }
}

async function checkS3Cors(origin: string): Promise<DiagnosticCheck[]> {
  const missing = ['AWS_REGION', 'S3_BUCKET', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY'].filter((key) => !process.env[key]);
  if (missing.length) {
    return [skipCheck('assessment.s3.cors', 'storage', 'S3 CORS', `Missing: ${missing.join(', ')}`)];
  }

  const bucket = process.env.S3_BUCKET!;
  const started = Date.now();
  try {
    const cors = await s3().send(new GetBucketCorsCommand({ Bucket: bucket }));
    const rules = cors.CORSRules ?? [];
    const matching = rules.find((rule) => {
      const origins = rule.AllowedOrigins ?? [];
      const methods = rule.AllowedMethods ?? [];
      const headers = (rule.AllowedHeaders ?? []).map((header) => header.toLowerCase());
      const originOk = origins.includes('*') || origins.includes(origin);
      const methodOk = methods.includes('PUT');
      const headerOk = headers.includes('*') || headers.includes('content-type');
      return originOk && methodOk && headerOk;
    });

    return [{
      id: 'assessment.s3.cors',
      scope: 'storage',
      label: 'S3 CORS',
      status: matching ? 'ok' : 'fail',
      required: true,
      summary: matching ? 'CORS allows browser PUT uploads from assessment origin' : 'No CORS rule matches assessment uploads',
      detail: matching ? undefined : `Expected AllowedOrigin ${origin}, AllowedMethod PUT, and AllowedHeader Content-Type or *.`,
      latency_ms: Date.now() - started,
      fields: [
        { label: 'origin', value: origin, tone: matching ? 'ok' : 'fail' },
        { label: 'rules', value: rules.length, tone: rules.length > 0 ? 'ok' : 'fail' },
      ],
    }];
  } catch (err) {
    const statusCode = awsStatusCode(err);
    const noCors = ['NoSuchCORSConfiguration', 'NoSuchCORSConfigurationError'].includes(awsErrorName(err));
    return [{
      id: 'assessment.s3.cors',
      scope: 'storage',
      label: 'S3 CORS',
      status: noCors ? 'fail' : statusCode === 403 ? 'warn' : 'fail',
      required: true,
      summary: noCors
        ? 'Bucket has no CORS configuration'
        : statusCode === 403
          ? 'IAM cannot read bucket CORS'
          : `Could not read bucket CORS (${awsPublicError(err)})`,
      detail: statusCode === 403
        ? 'Uploads may still work. Add s3:GetBucketCORS to this IAM user if you want this diagnostic to verify CORS.'
        : undefined,
      latency_ms: Date.now() - started,
    }];
  }
}

async function checkTurnstile(): Promise<DiagnosticCheck[]> {
  if (!process.env.TURNSTILE_SECRET_KEY) {
    return [skipCheck('assessment.turnstile', 'external-api', 'Turnstile', 'TURNSTILE_SECRET_KEY is not set')];
  }

  const started = Date.now();
  const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    body: new URLSearchParams({
      secret: process.env.TURNSTILE_SECRET_KEY,
      response: 'diagnostic-invalid-token',
    }),
    signal: AbortSignal.timeout(5_000),
  });
  const payload = await response.json().catch(() => ({})) as { 'error-codes'?: string[] };
  const codes = payload['error-codes'] ?? [];
  const secretBad = codes.includes('invalid-input-secret') || codes.includes('missing-input-secret');

  return [{
    id: 'assessment.turnstile',
    scope: 'external-api',
    label: 'Turnstile',
    status: secretBad ? 'fail' : response.ok ? 'ok' : 'warn',
    required: true,
    summary: secretBad
      ? 'Turnstile secret is invalid'
      : response.ok
        ? 'Turnstile API accepted the secret'
        : `Turnstile responded HTTP ${response.status}`,
    detail: response.ok ? 'Dummy token was rejected as expected.' : codes.join(', ') || undefined,
    latency_ms: Date.now() - started,
    fields: [
      { label: 'site_key', value: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ? 'set' : 'missing', tone: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ? 'ok' : 'fail' },
      { label: 'secret_key', value: 'set', tone: secretBad ? 'fail' : 'ok' },
    ],
  }];
}

function makeRedis(url: string) {
  const redis = new Redis(url, {
    lazyConnect: true,
    maxRetriesPerRequest: 0,
    enableOfflineQueue: false,
    connectTimeout: 5_000,
  });
  redis.on('error', () => undefined);
  return redis;
}

let s3Client: S3Client | null = null;
function s3() {
  s3Client ??= new S3Client({
    region: process.env.AWS_REGION ?? 'us-east-1',
    credentials: process.env.AWS_ACCESS_KEY_ID
      ? {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? '',
        }
      : undefined,
  });
  return s3Client;
}

async function withTimeout(
  promise: Promise<DiagnosticCheck[]>,
  id: string,
  label: string,
  scope: string,
): Promise<DiagnosticCheck[]> {
  try {
    return await Promise.race([
      promise,
      new Promise<DiagnosticCheck[]>((_, reject) => {
        setTimeout(() => reject(new Error(`Timed out after ${CHECK_TIMEOUT_MS}ms`)), CHECK_TIMEOUT_MS).unref();
      }),
    ]);
  } catch (err) {
    return [{
      id,
      scope,
      label,
      status: 'fail',
      required: true,
      summary: publicError(err),
    }];
  }
}

function skipCheck(id: string, scope: string, label: string, detail: string): DiagnosticCheck {
  return {
    id,
    scope,
    label,
    status: 'skip',
    required: true,
    summary: 'Check not run',
    detail,
  };
}

function title(value: string) {
  return value.slice(0, 1).toUpperCase() + value.slice(1);
}

function safeRedisUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//***@${parsed.host}`;
  } catch {
    return url
      .replace(/redis:\/\/[^@\s]+@/gi, 'redis://***@')
      .replace(/rediss:\/\/[^@\s]+@/gi, 'rediss://***@')
      .slice(0, 160);
  }
}

function publicError(err: unknown): string {
  if (err instanceof Error) {
    return err.message
      .replace(/redis:\/\/[^@\s]+@/gi, 'redis://***@')
      .replace(/rediss:\/\/[^@\s]+@/gi, 'rediss://***@')
      .slice(0, 240);
  }
  return String(err).slice(0, 240);
}

function awsStatusCode(err: unknown): number | undefined {
  return (err as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
}

function awsErrorName(err: unknown): string {
  return (err as { name?: string }).name ?? '';
}

function awsPublicError(err: unknown): string {
  const name = awsErrorName(err);
  const status = awsStatusCode(err);
  return [name, status ? `HTTP ${status}` : undefined].filter(Boolean).join(' ');
}

function s3Fields(bucket: string): DiagnosticField[] {
  return [
    { label: 'bucket', value: bucket, tone: 'ok' },
    { label: 'region', value: process.env.AWS_REGION ?? 'missing', tone: process.env.AWS_REGION ? 'ok' : 'fail' },
  ];
}

function parseHeartbeat(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function heartbeatFields(heartbeat: Record<string, unknown>, ageSeconds: number): DiagnosticField[] {
  const fields: DiagnosticField[] = [
    { label: 'age_seconds', value: Number.isFinite(ageSeconds) ? ageSeconds : 'unknown', tone: ageSeconds <= WORKER_HEARTBEAT_TTL_S ? 'ok' : 'fail' },
  ];
  for (const key of ['worker', 'queue', 'concurrency', 'started_at', 'heartbeat_at', 'runtime', 'image', 'memo_model']) {
    const value = heartbeat[key];
    if (value == null || value === '') continue;
    fields.push({ label: key, value: String(value), tone: 'ok' });
  }
  const config = heartbeat.config;
  if (config && typeof config === 'object') {
    for (const [key, value] of Object.entries(config as Record<string, unknown>)) {
      const present = typeof value === 'boolean' ? value : Boolean(value);
      fields.push({
        label: key,
        value: typeof value === 'boolean' ? (value ? 'set' : 'missing') : String(value),
        tone: present ? 'ok' : 'warn',
      });
    }
  }
  return fields;
}
