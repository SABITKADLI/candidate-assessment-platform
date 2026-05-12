import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const migrationsDir = path.resolve('db/migrations');

test('SQL migrations are ordered and wrapped in explicit transactions', async () => {
  const files = (await readdir(migrationsDir)).filter((file) => file.endsWith('.sql')).sort();
  assert.ok(files.length >= 11, 'expected the committed migration set');

  for (const [index, file] of files.entries()) {
    const expectedPrefix = String(index + 1).padStart(4, '0');
    assert.ok(file.startsWith(expectedPrefix), `${file} should start with ${expectedPrefix}`);

    const sql = await readFile(path.join(migrationsDir, file), 'utf8');
    assert.match(sql, /\bBEGIN\b/i, `${file} should begin a transaction`);
    assert.match(sql, /\bCOMMIT\b/i, `${file} should commit a transaction`);
  }
});

test('pipeline and email reconciliation migration includes required fields', async () => {
  const sql = await readFile(path.join(migrationsDir, '0013_pipeline_email_resume_identity.sql'), 'utf8');
  for (const token of [
    'pipeline_id',
    'purpose',
    'last_event',
    'last_event_at',
    'last_polled_at',
    'email_webhook_events',
    'email_log_pipeline_stage_b_once_idx',
    'rationale',
    'upload_kind',
  ]) {
    assert.match(sql, new RegExp(token), `0013 should include ${token}`);
  }
});
