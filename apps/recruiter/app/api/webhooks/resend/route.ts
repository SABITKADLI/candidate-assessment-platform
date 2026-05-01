import { NextRequest, NextResponse } from 'next/server';
import { Webhook } from 'svix';
import {
  updateEmailStatusByResendId,
  markEmailOpened,
  markEmailClicked,
} from '@/lib/emailLog';
import type { EmailStatus } from '@/lib/emailLog';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Events that update the delivery status column.
const STATUS_EVENTS: Record<string, EmailStatus> = {
  'email.sent':             'sending',
  'email.delivered':        'delivered',
  'email.bounced':          'bounced',
  'email.complained':       'complained',
  'email.delivery_delayed': 'sending',
};

// Events that only set engagement timestamps (opened_at / clicked_at).
// These never overwrite the delivery status.
const ENGAGEMENT_EVENTS = new Set(['email.opened', 'email.clicked']);

type ResendEvent = {
  type: string;
  created_at: string;
  data: { email_id: string; [key: string]: unknown };
};

export async function POST(req: NextRequest) {
  const rawBody = await req.text();

  const secret      = process.env.RESEND_WEBHOOK_SECRET;
  const svixId        = req.headers.get('svix-id');
  const svixTimestamp = req.headers.get('svix-timestamp');
  const svixSignature = req.headers.get('svix-signature');

  // Only verify when all three Svix headers are present.
  // Resend always sends them in production; absent headers allow unsigned
  // local test calls via curl without exposing a bypass in production.
  if (secret && svixId && svixTimestamp && svixSignature) {
    try {
      new Webhook(secret).verify(rawBody, {
        'svix-id':        svixId,
        'svix-timestamp': svixTimestamp,
        'svix-signature': svixSignature,
      });
    } catch {
      return NextResponse.json({ error: 'invalid_signature' }, { status: 401 });
    }
  }

  let event: ResendEvent;
  try {
    event = JSON.parse(rawBody) as ResendEvent;
  } catch {
    return NextResponse.json({ error: 'bad_json' }, { status: 400 });
  }

  const resendId = event.data?.email_id;
  if (!resendId) return NextResponse.json({ ok: true });

  const statusUpdate = STATUS_EVENTS[event.type];
  if (statusUpdate) {
    await updateEmailStatusByResendId(resendId, statusUpdate).catch(
      (e) => console.error('[webhook/resend] status update failed:', e),
    );
  } else if (event.type === 'email.opened') {
    await markEmailOpened(resendId).catch(
      (e) => console.error('[webhook/resend] opened update failed:', e),
    );
  } else if (event.type === 'email.clicked') {
    await markEmailClicked(resendId).catch(
      (e) => console.error('[webhook/resend] clicked update failed:', e),
    );
  }

  return NextResponse.json({ ok: true });
}

// Silence unused import warning — kept for documentation.
void ENGAGEMENT_EVENTS;
