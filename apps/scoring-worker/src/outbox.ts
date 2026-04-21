import crypto from 'node:crypto';
import pino from 'pino';
import { sql, auditLog } from '@cap/db';

// Polls app.ats_outbox for due rows, delivers via HTTP with an HMAC-SHA256
// signature header, backs off exponentially on failure, gives up after 8 tries.
//
// Webhook destination & signing secret are per-provider env vars — the
// worker never owns per-tenant keys; a single shared secret per provider is
// fine for MVP and rotates independently of the DB.

const log = pino({ level: process.env.LOG_LEVEL ?? 'info' });

type Provider = 'greenhouse' | 'lever' | 'workday';

const URLS: Record<Provider, string | undefined> = {
  greenhouse: process.env.ATS_GREENHOUSE_URL,
  lever:      process.env.ATS_LEVER_URL,
  workday:    process.env.ATS_WORKDAY_URL,
};
const SECRETS: Record<Provider, string | undefined> = {
  greenhouse: process.env.ATS_GREENHOUSE_SECRET,
  lever:      process.env.ATS_LEVER_SECRET,
  workday:    process.env.ATS_WORKDAY_SECRET,
};

const MAX_ATTEMPTS = 8;

export function startOutboxLoop(intervalMs = 5_000): () => void {
  let stopped = false;
  const tick = async () => {
    if (stopped) return;
    try { await drain(); }
    catch (e) { log.error({ err: String(e) }, 'outbox.drain.error'); }
    if (!stopped) setTimeout(tick, intervalMs).unref();
  };
  void tick();
  return () => { stopped = true; };
}

async function drain(): Promise<void> {
  // SKIP LOCKED lets multiple scoring-worker replicas share the queue safely.
  const rows = await sql<Array<{
    id: string; session_id: string; ats: Provider;
    payload: unknown; attempts: number;
  }>>`
    WITH due AS (
      SELECT id FROM app.ats_outbox
      WHERE status IN ('pending','failed')
        AND next_attempt_at <= now()
      ORDER BY next_attempt_at
      LIMIT 10
      FOR UPDATE SKIP LOCKED
    )
    UPDATE app.ats_outbox o
       SET status = 'delivering', updated_at = now()
      FROM due
     WHERE o.id = due.id
    RETURNING o.id, o.session_id, o.ats, o.payload, o.attempts
  `;
  if (!rows.length) return;

  await Promise.allSettled(rows.map(deliver));
}

async function deliver(r: { id: string; session_id: string; ats: Provider; payload: unknown; attempts: number }): Promise<void> {
  const url = URLS[r.ats];
  const secret = SECRETS[r.ats] ?? '';
  if (!url) {
    await fail(r, `no_url_for_${r.ats}`, /* permanent */ true);
    return;
  }
  const body = JSON.stringify(r.payload);
  const ts = Date.now().toString();
  const sig = crypto.createHmac('sha256', secret).update(`${ts}.${body}`).digest('hex');

  let status = 0; let bodyText = '';
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Cap-Timestamp': ts,
        'X-Cap-Signature': `sha256=${sig}`,
        'X-Cap-Outbox-Id': r.id,
      },
      body,
      // Safety net — BullMQ isn't in this path, so we enforce our own timeout.
      signal: AbortSignal.timeout(15_000),
    });
    status = res.status;
    if (status >= 200 && status < 300) {
      await markDelivered(r);
      return;
    }
    bodyText = (await res.text()).slice(0, 512);
  } catch (e) {
    bodyText = String(e).slice(0, 512);
  }
  await fail(r, `http_${status}: ${bodyText}`, false);
}

async function markDelivered(r: { id: string; session_id: string; ats: Provider }) {
  await sql`
    UPDATE app.ats_outbox
       SET status = 'delivered', delivered_at = now(), updated_at = now(), last_error = NULL
     WHERE id = ${r.id}::uuid
  `;
  await auditLog('scoring-worker', 'ats.outbox.delivered',
    `session:${r.session_id}`, { outbox_id: r.id, ats: r.ats });
}

async function fail(r: { id: string; session_id: string; ats: Provider; attempts: number }, err: string, permanent: boolean) {
  const nextAttempts = r.attempts + 1;
  const giveUp = permanent || nextAttempts >= MAX_ATTEMPTS;
  const backoffMs = Math.min(60 * 60_000, 2 ** nextAttempts * 1000); // cap 1h
  await sql`
    UPDATE app.ats_outbox
       SET status = ${giveUp ? 'failed' : 'pending'}::app.outbox_status,
           attempts = ${nextAttempts},
           next_attempt_at = now() + make_interval(secs => ${Math.round(backoffMs / 1000)}),
           last_error = ${err},
           updated_at = now()
     WHERE id = ${r.id}::uuid
  `;
  await auditLog('scoring-worker', giveUp ? 'ats.outbox.giveup' : 'ats.outbox.retry',
    `session:${r.session_id}`, { outbox_id: r.id, ats: r.ats, attempts: nextAttempts, err });
}
