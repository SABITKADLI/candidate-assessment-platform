import { NextRequest, NextResponse } from 'next/server';
import { Webhook } from 'svix';
import { applyResendEmailEvent } from '@/lib/emailLog';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type ResendEvent = {
  type: string;
  created_at: string;
  data: { email_id: string; [key: string]: unknown };
};

export async function POST(req: NextRequest) {
  const rawBody = await req.text();

  const secret = process.env.RESEND_WEBHOOK_SECRET;
  const svixId = req.headers.get('svix-id');
  const svixTimestamp = req.headers.get('svix-timestamp');
  const svixSignature = req.headers.get('svix-signature');

  // Resend sends Svix headers in production. Missing headers still allow
  // unsigned local curl tests when a developer has not configured a secret.
  if (secret && svixId && svixTimestamp && svixSignature) {
    try {
      new Webhook(secret).verify(rawBody, {
        'svix-id': svixId,
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

  await applyResendEmailEvent({
    resendId,
    eventType: event.type,
    occurredAt: event.created_at,
    source: 'webhook',
    webhookEventId: svixId,
    payload: event,
  }).catch((e) => console.error('[webhook/resend] update failed:', e));

  return NextResponse.json({ ok: true });
}
