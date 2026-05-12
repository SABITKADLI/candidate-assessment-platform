import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@cap/db';
import { applyResendEmailEvent } from '@/lib/emailLog';

export const dynamic = 'force-dynamic';

// Dev-only: simulate Resend webhook events for a session's latest email log entry.
// Never reachable in production.
export async function POST(req: NextRequest) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'not_available' }, { status: 404 });
  }

  const { session_id } = await req.json().catch(() => ({})) as { session_id?: string };
  if (!session_id) {
    return NextResponse.json({ error: 'session_id required' }, { status: 400 });
  }

  const [row] = await sql<{ resend_id: string }[]>`
    SELECT resend_id FROM app.email_log
    WHERE session_id = ${session_id}::uuid AND resend_id IS NOT NULL
    ORDER BY created_at DESC
    LIMIT 1
  `;

  if (!row?.resend_id) {
    return NextResponse.json({ error: 'no email log entry with resend_id found' }, { status: 404 });
  }

  const id = row.resend_id;
  await applyResendEmailEvent({ resendId: id, eventType: 'email.delivered', source: 'webhook' });
  await applyResendEmailEvent({ resendId: id, eventType: 'email.opened', source: 'webhook' });
  await applyResendEmailEvent({ resendId: id, eventType: 'email.clicked', source: 'webhook' });

  return NextResponse.json({ ok: true, resend_id: id, fired: ['delivered', 'opened', 'clicked'] });
}
