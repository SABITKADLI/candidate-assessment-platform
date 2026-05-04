import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import { buildAtsHeaders, signAtsPayload } from '../apps/scoring-worker/src/atsSignature';

test('ATS HMAC signature is deterministic and header-compatible', () => {
  const body = JSON.stringify({ ok: true });
  const timestamp = '1700000000000';
  const expected = `sha256=${crypto.createHmac('sha256', 'secret').update(`${timestamp}.${body}`).digest('hex')}`;

  assert.equal(signAtsPayload('secret', body, timestamp), expected);

  const headers = buildAtsHeaders('secret', body, 'outbox-1', timestamp);
  assert.equal(headers['Content-Type'], 'application/json');
  assert.equal(headers['X-Cap-Timestamp'], timestamp);
  assert.equal(headers['X-Cap-Signature'], expected);
  assert.equal(headers['X-Cap-Outbox-Id'], 'outbox-1');
});
