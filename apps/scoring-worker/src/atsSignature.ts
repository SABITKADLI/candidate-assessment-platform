import crypto from 'node:crypto';

export function signAtsPayload(secret: string, body: string, timestamp = Date.now().toString()): string {
  const signature = crypto.createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
  return `sha256=${signature}`;
}

export function buildAtsHeaders(
  secret: string,
  body: string,
  outboxId: string,
  timestamp = Date.now().toString(),
): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'X-Cap-Timestamp': timestamp,
    'X-Cap-Signature': signAtsPayload(secret, body, timestamp),
    'X-Cap-Outbox-Id': outboxId,
  };
}
