import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildAtsHeaders } from '../src/atsSignature';

type Provider = 'greenhouse' | 'lever' | 'workday';

const providers: Provider[] = ['greenhouse', 'lever', 'workday'];
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '../../..');
const envFiles = [
  path.join(repoRoot, '.env'),
  path.join(repoRoot, '.env.local'),
  path.join(repoRoot, 'workers.env'),
  path.join(repoRoot, 'apps/scoring-worker/.env'),
  path.join(repoRoot, 'apps/scoring-worker/.env.local'),
];

for (const file of envFiles) loadEnvFile(file);

const configured = providers.filter((provider) => {
  const prefix = provider.toUpperCase();
  return process.env[`ATS_${prefix}_URL`] && process.env[`ATS_${prefix}_SECRET`];
});

if (configured.length === 0) {
  console.error('No ATS webhook credentials configured. Set ATS_<PROVIDER>_URL and ATS_<PROVIDER>_SECRET.');
  process.exit(1);
}

let failures = 0;

for (const provider of configured) {
  const prefix = provider.toUpperCase();
  const url = process.env[`ATS_${prefix}_URL`]!;
  const secret = process.env[`ATS_${prefix}_SECRET`]!;
  const outboxId = `ats-check-${provider}-${Date.now()}`;
  const body = JSON.stringify({
    kind: 'cap_ats_connection_check',
    provider,
    source: 'cap-scoring-worker',
    sent_at: new Date().toISOString(),
  });

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: buildAtsHeaders(secret, body, outboxId),
      body,
      signal: AbortSignal.timeout(15_000),
    });
    const text = (await res.text()).replace(/\s+/g, ' ').slice(0, 240);
    if (res.status >= 200 && res.status < 300) {
      console.log(`${provider}: ok (${res.status})`);
    } else {
      failures += 1;
      console.error(`${provider}: failed (${res.status}) ${text}`);
    }
  } catch (err) {
    failures += 1;
    console.error(`${provider}: failed ${String(err).slice(0, 240)}`);
  }
}

if (failures > 0) process.exit(1);

function loadEnvFile(file: string): void {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(trimmed);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (!key || process.env[key]) continue;
    process.env[key] = stripQuotes(rawValue ?? '');
  }
}

function stripQuotes(value: string): string {
  const trimmed = value.trim();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}
