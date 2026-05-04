import { sql } from '@cap/db';
import {
  diagnosticsOk,
  summarizeDiagnostics,
  type DiagnosticCheck,
  type DiagnosticField,
  type DiagnosticStatus,
  type DiagnosticsResponse,
} from '@cap/shared/diagnostics';
import { auth0Configured } from './auth0';

const DEFAULT_MEMO_MODEL = 'claude-sonnet-4-20250514';
const CHECK_TIMEOUT_MS = 8_000;

export interface AdminDiagnosticsResponse extends DiagnosticsResponse {
  assessment?: DiagnosticsResponse;
}

export async function getAdminDiagnostics(): Promise<AdminDiagnosticsResponse> {
  const adminChecks = await Promise.all([
    checkAdminEnv(),
    withTimeout(checkAdminDatabase(), 'admin.db', 'Admin database', 'database'),
    withTimeout(checkAuth0(), 'admin.auth0', 'Auth0', 'external-api'),
    withTimeout(checkResend(), 'admin.resend', 'Resend', 'external-api'),
    withTimeout(checkAnthropic(), 'admin.anthropic', 'Anthropic', 'external-api'),
    withTimeout(checkAssessmentEndpoint(), 'admin.assessment.endpoint', 'Assessment diagnostics endpoint', 'assessment-runtime'),
  ]);

  const flatAdmin = adminChecks.flat();
  const assessment = extractAssessment(flatAdmin);
  const assessmentChecks = assessment?.checks ?? [];
  const checks = [...flatAdmin.filter((check) => check.id !== 'admin.assessment.payload'), ...assessmentChecks];

  return {
    service: 'admin',
    generated_at: new Date().toISOString(),
    ok: diagnosticsOk(checks),
    summary: summarizeDiagnostics(checks),
    checks,
    assessment,
  };
}

function checkAdminEnv(): DiagnosticCheck[] {
  const required = [
    'DATABASE_URL',
    'AUTH0_SECRET',
    'AUTH0_DOMAIN',
    'AUTH0_CLIENT_ID',
    'AUTH0_CLIENT_SECRET',
    'APP_BASE_URL',
    'NEXT_PUBLIC_CANDIDATE_BASE_URL',
    'CRON_SECRET',
    'RESEND_API_KEY',
    'RESEND_WEBHOOK_SECRET',
    'ANTHROPIC_API_KEY',
  ];
  const optional = [
    'MEMO_MODEL',
    'DIAGNOSTICS_SECRET',
  ];
  const missing = required.filter((key) => !process.env[key]);
  const fields: DiagnosticField[] = [
    ...required.map((key) => ({
      label: key,
      value: process.env[key] ? 'set' : 'missing',
      tone: process.env[key] ? 'ok' as DiagnosticStatus : 'fail' as DiagnosticStatus,
    })),
    ...optional.map((key) => ({
      label: key,
      value: process.env[key] ? 'set' : 'not set',
      tone: process.env[key] ? 'ok' as DiagnosticStatus : 'warn' as DiagnosticStatus,
    })),
  ];

  return [{
    id: 'admin.env',
    scope: 'admin-runtime',
    label: 'Admin environment',
    status: missing.length ? 'fail' : 'ok',
    required: true,
    summary: missing.length ? `${missing.length} required env var(s) missing` : 'Required admin env vars are present',
    detail: missing.length ? `Missing: ${missing.join(', ')}` : undefined,
    fields,
  }];
}

async function checkAdminDatabase(): Promise<DiagnosticCheck[]> {
  const started = Date.now();
  const [probe] = await sql<Array<{ db_name: string; db_user: string }>>`
    SELECT current_database() AS db_name, current_user AS db_user
  `;
  const [migration] = await sql<Array<{ version: string; name: string; applied_at: string }>>`
    SELECT version, name, applied_at::text AS applied_at
    FROM app.schema_migrations
    ORDER BY version DESC
    LIMIT 1
  `;
  const [counts] = await sql<Array<{ sessions: number; candidates: number; roles: number; active_gma_items: number }>>`
    SELECT
      (SELECT count(*)::int FROM app.sessions) AS sessions,
      (SELECT count(*)::int FROM app.candidates) AS candidates,
      (SELECT count(*)::int FROM app.roles WHERE active = true) AS roles,
      (SELECT count(*)::int FROM app.gma_items WHERE active = true) AS active_gma_items
  `;

  const activeItems = Number(counts?.active_gma_items ?? 0);
  return [{
    id: 'admin.db',
    scope: 'database',
    label: 'Admin database',
    status: activeItems >= 50 ? 'ok' : 'warn',
    required: true,
    summary: activeItems >= 50 ? 'Database reachable and migrations are visible' : 'Database reachable, but GMA bank is below 50 items',
    detail: migration ? `Latest migration ${migration.version}_${migration.name}` : 'schema_migrations has no applied rows',
    latency_ms: Date.now() - started,
    fields: [
      { label: 'database', value: probe?.db_name ?? 'unknown', tone: 'ok' },
      { label: 'user', value: probe?.db_user ?? 'unknown', tone: 'ok' },
      { label: 'latest_migration', value: migration ? `${migration.version}_${migration.name}` : 'none', tone: migration ? 'ok' : 'warn' },
      { label: 'sessions', value: Number(counts?.sessions ?? 0), tone: 'ok' },
      { label: 'candidates', value: Number(counts?.candidates ?? 0), tone: 'ok' },
      { label: 'active_roles', value: Number(counts?.roles ?? 0), tone: 'ok' },
      { label: 'active_gma_items', value: activeItems, tone: activeItems >= 50 ? 'ok' : 'warn' },
    ],
  }];
}

async function checkAuth0(): Promise<DiagnosticCheck[]> {
  if (!process.env.AUTH0_DOMAIN) {
    return [skipCheck('admin.auth0', 'external-api', 'Auth0', 'AUTH0_DOMAIN is not set')];
  }

  const started = Date.now();
  const domain = normalizeAuth0Domain(process.env.AUTH0_DOMAIN);
  const response = await fetch(`https://${domain}/.well-known/openid-configuration`, {
    cache: 'no-store',
    signal: AbortSignal.timeout(5_000),
  });
  const payload = await response.json().catch(() => ({})) as { issuer?: string };
  const expectedIssuer = `https://${domain}/`;
  const issuerOk = payload.issuer === expectedIssuer;
  const status: DiagnosticStatus = response.ok && issuerOk && auth0Configured ? 'ok' : 'fail';

  return [{
    id: 'admin.auth0',
    scope: 'external-api',
    label: 'Auth0',
    status,
    required: true,
    summary: status === 'ok' ? 'Auth0 tenant metadata is reachable' : `Auth0 check failed (HTTP ${response.status})`,
    detail: issuerOk ? undefined : `Expected issuer ${expectedIssuer}, got ${payload.issuer ?? 'none'}`,
    latency_ms: Date.now() - started,
    fields: [
      { label: 'domain', value: domain, tone: response.ok ? 'ok' : 'fail' },
      { label: 'client_id', value: process.env.AUTH0_CLIENT_ID ? 'set' : 'missing', tone: process.env.AUTH0_CLIENT_ID ? 'ok' : 'fail' },
      { label: 'client_secret', value: process.env.AUTH0_CLIENT_SECRET ? 'set' : 'missing', tone: process.env.AUTH0_CLIENT_SECRET ? 'ok' : 'fail' },
      { label: 'app_base_url', value: process.env.APP_BASE_URL ?? 'missing', tone: process.env.APP_BASE_URL ? 'ok' : 'fail' },
    ],
  }];
}

async function checkResend(): Promise<DiagnosticCheck[]> {
  if (!process.env.RESEND_API_KEY) {
    return [skipCheck('admin.resend', 'external-api', 'Resend', 'RESEND_API_KEY is not set')];
  }

  const started = Date.now();
  const response = await fetch('https://api.resend.com/domains?limit=1', {
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
    cache: 'no-store',
    signal: AbortSignal.timeout(5_000),
  });
  const body = await response.json().catch(() => ({})) as { message?: string; data?: unknown[] };
  const ok = response.ok;

  return [{
    id: 'admin.resend',
    scope: 'external-api',
    label: 'Resend',
    status: ok ? 'ok' : response.status === 401 || response.status === 403 ? 'fail' : 'warn',
    required: true,
    summary: ok ? 'Resend API key is accepted' : `Resend responded HTTP ${response.status}`,
    detail: ok ? undefined : body.message,
    latency_ms: Date.now() - started,
    fields: [
      { label: 'api_key', value: 'set', tone: ok ? 'ok' : 'fail' },
      { label: 'email_from', value: process.env.EMAIL_FROM ?? 'default', tone: process.env.EMAIL_FROM ? 'ok' : 'warn' },
      { label: 'webhook_secret', value: process.env.RESEND_WEBHOOK_SECRET ? 'set' : 'missing', tone: process.env.RESEND_WEBHOOK_SECRET ? 'ok' : 'fail' },
    ],
  }];
}

async function checkAnthropic(): Promise<DiagnosticCheck[]> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return [skipCheck('admin.anthropic', 'external-api', 'Anthropic', 'ANTHROPIC_API_KEY is not set')];
  }

  const started = Date.now();
  const model = process.env.MEMO_MODEL ?? DEFAULT_MEMO_MODEL;
  const response = await fetch('https://api.anthropic.com/v1/models?limit=100', {
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    cache: 'no-store',
    signal: AbortSignal.timeout(5_000),
  });
  const body = await response.json().catch(() => ({})) as { data?: Array<{ id?: string }>; error?: { message?: string } };
  const modelIds = (body.data ?? []).map((item) => item.id).filter(Boolean);
  const modelAvailable = modelIds.includes(model);

  return [{
    id: 'admin.anthropic',
    scope: 'external-api',
    label: 'Anthropic',
    status: response.ok ? modelAvailable ? 'ok' : 'warn' : response.status === 401 || response.status === 403 ? 'fail' : 'warn',
    required: true,
    summary: response.ok
      ? modelAvailable
        ? 'Anthropic key is accepted and memo model is available'
        : 'Anthropic key is accepted, but memo model was not listed'
      : `Anthropic responded HTTP ${response.status}`,
    detail: response.ok ? undefined : body.error?.message,
    latency_ms: Date.now() - started,
    fields: [
      { label: 'api_key', value: 'set', tone: response.ok ? 'ok' : 'fail' },
      { label: 'memo_model', value: model, tone: modelAvailable ? 'ok' : 'warn' },
      { label: 'models_seen', value: modelIds.length, tone: response.ok ? 'ok' : 'warn' },
    ],
  }];
}

async function checkAssessmentEndpoint(): Promise<DiagnosticCheck[]> {
  const base = process.env.NEXT_PUBLIC_CANDIDATE_BASE_URL;
  if (!base) {
    return [skipCheck('admin.assessment.endpoint', 'assessment-runtime', 'Assessment diagnostics endpoint', 'NEXT_PUBLIC_CANDIDATE_BASE_URL is not set')];
  }

  const started = Date.now();
  const endpoint = new URL('/api/health/queues', base).toString();
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (process.env.DIAGNOSTICS_SECRET) {
    headers['x-cap-diagnostics-secret'] = process.env.DIAGNOSTICS_SECRET;
  }

  const response = await fetch(endpoint, {
    headers,
    cache: 'no-store',
    signal: AbortSignal.timeout(7_000),
  });
  const payload = await response.json().catch(() => null) as DiagnosticsResponse | null;
  if (!payload?.checks) {
    return [{
      id: 'admin.assessment.endpoint',
      scope: 'assessment-runtime',
      label: 'Assessment diagnostics endpoint',
      status: 'fail',
      required: true,
      summary: `Assessment endpoint returned HTTP ${response.status}`,
      latency_ms: Date.now() - started,
      fields: [
        { label: 'endpoint', value: endpoint, tone: 'fail' },
      ],
    }];
  }

  return [{
    id: 'admin.assessment.endpoint',
    scope: 'assessment-runtime',
    label: 'Assessment diagnostics endpoint',
    status: response.status === 401 ? 'fail' : 'ok',
    required: true,
    summary: response.status === 401 ? 'Diagnostics secret mismatch' : `Assessment report received (${payload.summary.fail} failing)`,
    detail: response.ok ? undefined : `Assessment endpoint returned HTTP ${response.status}; nested checks explain why.`,
    latency_ms: Date.now() - started,
    fields: [
      { label: 'endpoint', value: endpoint, tone: response.status === 401 ? 'fail' : 'ok' },
      { label: 'assessment_failures', value: payload.summary.fail, tone: payload.summary.fail > 0 ? 'fail' : 'ok' },
      { label: 'assessment_warnings', value: payload.summary.warn, tone: payload.summary.warn > 0 ? 'warn' : 'ok' },
    ],
  }, {
    id: 'admin.assessment.payload',
    scope: 'assessment-runtime',
    label: 'Assessment payload',
    status: 'skip',
    required: false,
    summary: JSON.stringify(payload),
  }];
}

async function withTimeout(
  promise: Promise<DiagnosticCheck[]>,
  id: string,
  label: string,
  scope: string,
): Promise<DiagnosticCheck[]> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<DiagnosticCheck[]>((_, reject) => {
        timeout = setTimeout(() => reject(new Error(`Timed out after ${CHECK_TIMEOUT_MS}ms`)), CHECK_TIMEOUT_MS);
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
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function extractAssessment(checks: DiagnosticCheck[]): DiagnosticsResponse | undefined {
  const payload = checks.find((check) => check.id === 'admin.assessment.payload')?.summary;
  if (!payload) return undefined;
  try {
    const parsed = JSON.parse(payload) as DiagnosticsResponse;
    return parsed?.checks ? parsed : undefined;
  } catch {
    return undefined;
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

function normalizeAuth0Domain(domain: string): string {
  return domain.replace(/^https?:\/\//, '').replace(/\/+$/, '');
}

function publicError(err: unknown): string {
  if (err instanceof Error) {
    return err.message
      .replace(/postgres:\/\/[^@\s]+@/gi, 'postgres://***@')
      .replace(/redis:\/\/[^@\s]+@/gi, 'redis://***@')
      .replace(/rediss:\/\/[^@\s]+@/gi, 'rediss://***@')
      .slice(0, 240);
  }
  return String(err).slice(0, 240);
}
