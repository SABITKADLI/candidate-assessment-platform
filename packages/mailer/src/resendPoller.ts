import pino from 'pino';
import { sql } from '@cap/db';
import { getResend } from './mailer';
import { applyResendEmailEvent, markEmailPollFailed } from './emailLog';

const log = pino({ level: process.env.LOG_LEVEL ?? 'info' });

type PollRow = {
  id: string;
  resend_id: string;
};

type ResendEmailDetails = {
  id?: string;
  last_event?: string | null;
};

export function startResendStatusPoller(intervalMs = 60_000): () => void {
  let stopped = false;
  const tick = async () => {
    if (stopped) return;
    try {
      await pollActiveResendEmails();
    } catch (err) {
      log.error({ err: String(err) }, 'resend.poll.error');
    }
    if (!stopped) setTimeout(tick, intervalMs).unref();
  };
  void tick();
  return () => { stopped = true; };
}

export async function pollActiveResendEmails(limit = 25): Promise<number> {
  const resend = getResend();
  if (!resend) return 0;

  const rows = await sql<PollRow[]>`
    SELECT e.id, e.resend_id
    FROM app.email_log e
    JOIN app.sessions s ON s.id = e.session_id
    WHERE e.resend_id IS NOT NULL
      AND s.status NOT IN ('completed','expired','abandoned','disqualified')
      AND s.expires_at > now()
      AND (
        e.last_polled_at IS NULL
        OR e.last_polled_at <= now() - make_interval(secs => 55)
      )
    ORDER BY e.last_polled_at ASC NULLS FIRST, e.created_at ASC
    LIMIT ${limit}
  `;
  if (!rows.length) return 0;

  let checked = 0;
  await Promise.allSettled(rows.map(async (row) => {
    try {
      const { data, error } = await resend.emails.get(row.resend_id);
      if (error) {
        await markEmailPollFailed(row.id, `${error.name}: ${error.message}`);
        return;
      }

      const details = data as ResendEmailDetails | null;
      if (details?.last_event) {
        await applyResendEmailEvent({
          resendId: row.resend_id,
          eventType: details.last_event,
          occurredAt: new Date(),
          source: 'poll',
        });
      } else {
        await markEmailPollFailed(row.id, 'resend response missing last_event');
      }
      checked += 1;
    } catch (err) {
      await markEmailPollFailed(row.id, String(err).slice(0, 500)).catch(() => undefined);
    }
  }));

  return checked;
}
