import type { EmailStatus } from './emailLog';

export type ResendEventSource = 'webhook' | 'poll';

export type ResendEventUpdate = {
  event: string;
  status: EmailStatus | null;
  opened: boolean;
  clicked: boolean;
};

const STATUS_BY_EVENT: Record<string, EmailStatus> = {
  scheduled: 'scheduled',
  sent: 'sending',
  delivered: 'delivered',
  delivery_delayed: 'sending',
  bounced: 'bounced',
  complained: 'complained',
  failed: 'failed',
  suppressed: 'suppressed',
};

export function normalizeResendEvent(type: string | null | undefined): string {
  return String(type ?? '').trim().toLowerCase().replace(/^email\./, '');
}

export function emailUpdateForResendEvent(type: string | null | undefined): ResendEventUpdate | null {
  const event = normalizeResendEvent(type);
  if (!event) return null;

  if (event === 'opened') {
    return { event, status: 'delivered', opened: true, clicked: false };
  }
  if (event === 'clicked') {
    return { event, status: 'delivered', opened: false, clicked: true };
  }

  const status = STATUS_BY_EVENT[event] ?? null;
  if (!status) return { event, status: null, opened: false, clicked: false };
  return { event, status, opened: false, clicked: false };
}

export function shouldPollEmailForSession(args: {
  sessionStatus: string;
  expiresAt: Date;
  resendId: string | null;
}): boolean {
  if (!args.resendId) return false;
  if (args.expiresAt.getTime() <= Date.now()) return false;
  return !['completed', 'expired', 'abandoned', 'disqualified'].includes(args.sessionStatus);
}
