import crypto from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');
const migrationsDir = path.join(repoRoot, 'db', 'migrations');

await loadEnvFile(path.join(repoRoot, '.env'));
await loadEnvFile(path.join(repoRoot, '.env.local'));
await loadEnvFile(path.join(repoRoot, 'workers.env'));

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is required. Example: DATABASE_URL=postgres://... pnpm db:migrate');
  process.exit(1);
}

const command = process.argv[2] ?? 'up';
const sql = postgres(url, {
  max: 1,
  idle_timeout: 5,
  connect_timeout: 10,
  prepare: false,
});

try {
  await ensureMigrationsTable();
  const migrations = await readMigrations();

  if (command === 'status') {
    await printStatus(migrations);
  } else if (command === 'up') {
    await applyPending(migrations);
  } else {
    throw new Error(`Unknown command "${command}". Use "up" or "status".`);
  }
} finally {
  await sql.end({ timeout: 5 });
}

async function ensureMigrationsTable() {
  await sql`CREATE SCHEMA IF NOT EXISTS app`;
  await sql`
    CREATE TABLE IF NOT EXISTS app.schema_migrations (
      version    text PRIMARY KEY,
      name       text NOT NULL,
      checksum   text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `;
}

async function loadEnvFile(filePath) {
  if (process.env.DATABASE_URL) return;
  let contents;
  try {
    contents = await readFile(filePath, 'utf8');
  } catch {
    return;
  }

  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const index = trimmed.indexOf('=');
    if (index === -1) continue;
    const key = trimmed.slice(0, index).trim();
    if (process.env[key]) continue;
    const value = trimmed.slice(index + 1).trim().replace(/^['"]|['"]$/g, '');
    process.env[key] = value;
  }
}

async function readMigrations() {
  const files = (await readdir(migrationsDir))
    .filter((file) => file.endsWith('.sql'))
    .sort();

  return Promise.all(files.map(async (file) => {
    const contents = await readFile(path.join(migrationsDir, file), 'utf8');
    const [version, ...nameParts] = file.replace(/\.sql$/, '').split('_');
    return {
      file,
      version,
      name: nameParts.join('_'),
      contents,
      checksum: crypto.createHash('sha256').update(contents).digest('hex'),
    };
  }));
}

async function appliedMap() {
  const rows = await sql`
    SELECT version, checksum FROM app.schema_migrations
  `;
  return new Map(rows.map((row) => [row.version, row.checksum]));
}

async function printStatus(migrations) {
  const applied = await appliedMap();
  for (const migration of migrations) {
    const checksum = applied.get(migration.version);
    const state = checksum
      ? checksum === migration.checksum ? 'applied' : 'checksum-mismatch'
      : 'pending';
    console.log(`${migration.version} ${state} ${migration.file}`);
  }
}

async function applyPending(migrations) {
  const applied = await appliedMap();
  for (const migration of migrations) {
    const checksum = applied.get(migration.version);
    if (checksum) {
      if (checksum !== migration.checksum) {
        throw new Error(`Checksum mismatch for ${migration.file}. Refusing to continue.`);
      }
      continue;
    }

    console.log(`Applying ${migration.file}`);
    await sql.unsafe(migration.contents);
    await sql`
      INSERT INTO app.schema_migrations (version, name, checksum)
      VALUES (${migration.version}, ${migration.name}, ${migration.checksum})
    `;
  }
}
