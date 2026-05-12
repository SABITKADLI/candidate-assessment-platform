import assert from 'node:assert/strict';
import test from 'node:test';
import {
  emailUpdateForResendEvent,
  normalizeResendEvent,
  shouldPollEmailForSession,
} from '../packages/mailer/src/resendEvents';

test('Resend events normalize webhook and retrieve-email shapes', () => {
  assert.equal(normalizeResendEvent('email.delivered'), 'delivered');
  assert.equal(normalizeResendEvent('clicked'), 'clicked');
});

test('Resend events map delivery, failure, and engagement updates', () => {
  assert.deepEqual(emailUpdateForResendEvent('email.sent'), {
    event: 'sent',
    status: 'sending',
    opened: false,
    clicked: false,
  });
  assert.equal(emailUpdateForResendEvent('email.scheduled')?.status, 'scheduled');
  assert.equal(emailUpdateForResendEvent('email.delivered')?.status, 'delivered');
  assert.equal(emailUpdateForResendEvent('email.bounced')?.status, 'bounced');
  assert.equal(emailUpdateForResendEvent('email.complained')?.status, 'complained');
  assert.equal(emailUpdateForResendEvent('email.failed')?.status, 'failed');
  assert.equal(emailUpdateForResendEvent('email.suppressed')?.status, 'suppressed');

  const opened = emailUpdateForResendEvent('email.opened');
  assert.equal(opened?.status, 'delivered');
  assert.equal(opened?.opened, true);

  const clicked = emailUpdateForResendEvent('clicked');
  assert.equal(clicked?.status, 'delivered');
  assert.equal(clicked?.clicked, true);
});

test('Resend polling is limited to active non-final sessions', () => {
  const future = new Date(Date.now() + 60_000);
  const past = new Date(Date.now() - 60_000);
  assert.equal(shouldPollEmailForSession({ sessionStatus: 'pending', expiresAt: future, resendId: 'em_123' }), true);
  assert.equal(shouldPollEmailForSession({ sessionStatus: 'in_progress', expiresAt: future, resendId: 'em_123' }), true);
  assert.equal(shouldPollEmailForSession({ sessionStatus: 'completed', expiresAt: future, resendId: 'em_123' }), false);
  assert.equal(shouldPollEmailForSession({ sessionStatus: 'expired', expiresAt: future, resendId: 'em_123' }), false);
  assert.equal(shouldPollEmailForSession({ sessionStatus: 'pending', expiresAt: past, resendId: 'em_123' }), false);
  assert.equal(shouldPollEmailForSession({ sessionStatus: 'pending', expiresAt: future, resendId: null }), false);
});
