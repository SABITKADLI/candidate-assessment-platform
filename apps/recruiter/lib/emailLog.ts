import { sql } from '@cap/db';

export type EmailStatus =
  | 'queued'
  | 'sending'
  | 'delivered'
  | 'bounced'
  | 'complained'
  | 'failed';

export type EmailLogRow = {
  id: string;
  session_id: string | null;
  to_email: string;
  resend_id: string | null;
  status: EmailStatus;
  attempts: number;
  last_error: string | null;
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

export async function createEmailLogEntry(
  sessionId: string | null,
  toEmail: string,
): Promise<string> {
  const [row] = await sql<{ id: string }[]>`
    INSERT INTO app.email_log (session_id, to_email)
    VALUES (${sessionId ? sql`${sessionId}::uuid` : null}, ${toEmail})
    RETURNING id
  `;
  return row!.id;
}

export async function markEmailSending(logId: string, resendId: string): Promise<void> {
  await sql`
    UPDATE app.email_log
    SET status = 'sending', resend_id = ${resendId},
        attempts = attempts + 1, updated_at = now()
    WHERE id = ${logId}::uuid
  `;
}

export async function markEmailFailed(logId: string, error: string): Promise<void> {
  await sql`
    UPDATE app.email_log
    SET status = 'failed', last_error = ${error},
        attempts = attempts + 1, updated_at = now()
    WHERE id = ${logId}::uuid
  `;
}

export async function updateEmailStatusByResendId(
  resendId: string,
  status: EmailStatus,
): Promise<void> {
  await sql`
    UPDATE app.email_log
    SET status = ${status}, updated_at = now()
    WHERE resend_id = ${resendId}
  `;
}

export async function markEmailOpened(resendId: string): Promise<void> {
  await sql`
    UPDATE app.email_log
    SET opened_at = COALESCE(opened_at, now()), updated_at = now()
    WHERE resend_id = ${resendId}
  `;
}

export async function markEmailClicked(resendId: string): Promise<void> {
  await sql`
    UPDATE app.email_log
    SET clicked_at = COALESCE(clicked_at, now()), updated_at = now()
    WHERE resend_id = ${resendId}
  `;
}

export async function getEmailLogForSession(sessionId: string): Promise<EmailLogRow[]> {
  return sql<EmailLogRow[]>`
    SELECT id, session_id::text AS session_id, to_email, resend_id,
           status, attempts, last_error, opened_at, clicked_at,
           created_at, updated_at
    FROM app.email_log
    WHERE session_id = ${sessionId}::uuid
    ORDER BY created_at DESC
  `;
}

// Returns latest status + engagement flags per session for the sessions list.
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
