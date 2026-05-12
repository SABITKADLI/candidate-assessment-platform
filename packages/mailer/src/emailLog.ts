import { sql } from '@cap/db';
import { emailUpdateForResendEvent, type ResendEventSource } from './resendEvents';

export type EmailStatus =
  | 'queued'
  | 'sending'
  | 'scheduled'
  | 'delivered'
  | 'bounced'
  | 'complained'
  | 'failed'
  | 'suppressed';

export type EmailPurpose =
  | 'invite'
  | 'manual_resend'
  | 'pipeline_stage_b_auto'
  | 'pipeline_stage_a_initial';

export type EmailLogRow = {
  id: string;
  session_id: string | null;
  to_email: string;
  resend_id: string | null;
  purpose: string;
  status: EmailStatus;
  attempts: number;
  last_error: string | null;
  last_event: string | null;
  last_event_at: Date | null;
  last_polled_at: Date | null;
  opened_at: Date | null;
  clicked_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

export type EmailSummary = {
  status: EmailStatus;
  opened: boolean;
  clicked: boolean;
};

export type CreateEmailLogResult = {
  id: string;
  created: boolean;
  status: EmailStatus;
  resend_id: string | null;
};

export async function createEmailLogEntry(
  sessionId: string | null,
  toEmail: string,
  purpose = 'invite',
): Promise<string> {
  const [row] = await sql<{ id: string }[]>`
    INSERT INTO app.email_log (session_id, to_email, purpose)
    VALUES (${sessionId ? sql`${sessionId}::uuid` : null}, ${toEmail}, ${purpose})
    RETURNING id
  `;
  return row!.id;
}

export async function createEmailLogEntryOnce(
  sessionId: string,
  toEmail: string,
  purpose: string,
): Promise<CreateEmailLogResult> {
  const inserted = await sql<Array<{ id: string; status: EmailStatus; resend_id: string | null }>>`
    INSERT INTO app.email_log (session_id, to_email, purpose)
    VALUES (${sessionId}::uuid, ${toEmail}, ${purpose})
    ON CONFLICT DO NOTHING
    RETURNING id, status, resend_id
  `;
  const row = inserted[0];
  if (row) return { ...row, created: true };

  const [existing] = await sql<Array<{ id: string; status: EmailStatus; resend_id: string | null }>>`
    SELECT id, status, resend_id
    FROM app.email_log
    WHERE session_id = ${sessionId}::uuid
      AND purpose = ${purpose}
    ORDER BY created_at ASC
    LIMIT 1
  `;
  if (!existing) {
    throw new Error(`idempotent email log was not inserted or found for ${sessionId}/${purpose}`);
  }
  return { ...existing, created: false };
}

export async function markEmailSending(logId: string, resendId: string): Promise<void> {
  await sql`
    UPDATE app.email_log
       SET status = 'sending',
           resend_id = ${resendId},
           attempts = attempts + 1,
           updated_at = now()
     WHERE id = ${logId}::uuid
  `;
}

export async function markEmailFailed(logId: string, error: string): Promise<void> {
  await sql`
    UPDATE app.email_log
       SET status = 'failed',
           last_error = ${error},
           attempts = attempts + 1,
           updated_at = now()
     WHERE id = ${logId}::uuid
  `;
}

export async function markEmailPollFailed(logId: string, error: string): Promise<void> {
  await sql`
    UPDATE app.email_log
       SET last_error = ${error},
           last_polled_at = now(),
           updated_at = now()
     WHERE id = ${logId}::uuid
  `;
}

export async function updateEmailStatusByResendId(
  resendId: string,
  status: EmailStatus,
): Promise<void> {
  await sql`
    UPDATE app.email_log
       SET status = ${status},
           updated_at = now()
     WHERE resend_id = ${resendId}
  `;
}

export async function markEmailOpened(resendId: string): Promise<void> {
  await sql`
    UPDATE app.email_log
       SET opened_at = COALESCE(opened_at, now()),
           updated_at = now()
     WHERE resend_id = ${resendId}
  `;
}

export async function markEmailClicked(resendId: string): Promise<void> {
  await sql`
    UPDATE app.email_log
       SET clicked_at = COALESCE(clicked_at, now()),
           updated_at = now()
     WHERE resend_id = ${resendId}
  `;
}

export async function recordResendWebhookEvent(args: {
  id: string;
  resendId: string | null;
  eventType: string;
  eventCreatedAt: Date | null;
  payload: unknown;
}): Promise<boolean> {
  const rows = await sql<Array<{ id: string }>>`
    INSERT INTO app.email_webhook_events (
      id, resend_id, event_type, event_created_at, payload
    ) VALUES (
      ${args.id},
      ${args.resendId},
      ${args.eventType},
      ${args.eventCreatedAt},
      ${sql.json(args.payload as never)}
    )
    ON CONFLICT (id) DO NOTHING
    RETURNING id
  `;
  return rows.length > 0;
}

export async function applyResendEmailEvent(args: {
  resendId: string;
  eventType: string;
  occurredAt?: Date | string | null;
  source: ResendEventSource;
  webhookEventId?: string | null;
  payload?: unknown;
}): Promise<{ applied: boolean; deduped: boolean; event: string | null }> {
  const occurredAt = toDate(args.occurredAt) ?? new Date();

  if (args.webhookEventId) {
    const inserted = await recordResendWebhookEvent({
      id: args.webhookEventId,
      resendId: args.resendId,
      eventType: args.eventType,
      eventCreatedAt: occurredAt,
      payload: args.payload ?? {},
    });
    if (!inserted) return { applied: false, deduped: true, event: null };
  }

  const update = emailUpdateForResendEvent(args.eventType);
  if (!update) return { applied: false, deduped: false, event: null };

  const rows = await sql<Array<{ id: string }>>`
    UPDATE app.email_log
       SET status = CASE
             WHEN ${update.status}::text IS NULL THEN status
             ELSE ${update.status}::text
           END,
           last_event = ${update.event},
           last_event_at = ${occurredAt},
           last_polled_at = CASE
             WHEN ${args.source} = 'poll' THEN now()
             ELSE last_polled_at
           END,
           opened_at = CASE
             WHEN ${update.opened} THEN COALESCE(opened_at, ${occurredAt})
             ELSE opened_at
           END,
           clicked_at = CASE
             WHEN ${update.clicked} THEN COALESCE(clicked_at, ${occurredAt})
             ELSE clicked_at
           END,
           last_error = NULL,
           updated_at = now()
     WHERE resend_id = ${args.resendId}
       AND (
         last_event_at IS NULL
         OR last_event_at <= ${occurredAt}
         OR ${args.source} = 'poll'
       )
    RETURNING id
  `;

  return { applied: rows.length > 0, deduped: false, event: update.event };
}

export async function getEmailLogForSession(sessionId: string): Promise<EmailLogRow[]> {
  return sql<EmailLogRow[]>`
    SELECT id, session_id::text AS session_id, to_email, resend_id,
           purpose, status, attempts, last_error, last_event,
           last_event_at, last_polled_at, opened_at, clicked_at,
           created_at, updated_at
    FROM app.email_log
    WHERE session_id = ${sessionId}::uuid
    ORDER BY created_at DESC
  `;
}

export async function getEmailStatusesForSessions(
  sessionIds: string[],
): Promise<Record<string, EmailSummary>> {
  if (!sessionIds.length) return {};
  try {
    const rows = await sql<{
      session_id: string;
      status: EmailStatus;
      opened: boolean;
      clicked: boolean;
    }[]>`
      SELECT DISTINCT ON (session_id)
             session_id::text AS session_id,
             status,
             (opened_at  IS NOT NULL) AS opened,
             (clicked_at IS NOT NULL) AS clicked
      FROM app.email_log
      WHERE session_id = ANY(${sessionIds}::uuid[])
      ORDER BY session_id, created_at DESC
    `;
    return Object.fromEntries(
      rows.map((r) => [r.session_id, { status: r.status, opened: r.opened, clicked: r.clicked }]),
    );
  } catch {
    return {};
  }
}

function toDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
