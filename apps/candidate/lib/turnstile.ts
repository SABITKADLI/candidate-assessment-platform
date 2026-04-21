// Turnstile (Cloudflare bot-challenge) helper.
//
// Soft-fail policy: if keys are unset in dev, verification returns true with
// a console.warn. Prod MUST set both env vars.
//
// Site key is public (NEXT_PUBLIC_*) because the widget needs it in the
// browser. Secret key is server-only.

export const turnstileEnabled = Boolean(
  process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY && process.env.TURNSTILE_SECRET_KEY,
);

export async function verifyTurnstile(token: string, ip?: string): Promise<boolean> {
  if (!turnstileEnabled) {
    console.warn('[turnstile] keys unset — soft-fail, accepting');
    return true;
  }
  try {
    const body = new URLSearchParams({
      secret: process.env.TURNSTILE_SECRET_KEY!,
      response: token,
    });
    if (ip) body.set('remoteip', ip);

    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      // Safety net — don't hang a request forever if CF is slow.
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) return false;
    const j = (await res.json()) as { success?: boolean; 'error-codes'?: string[] };
    return Boolean(j.success);
  } catch (e) {
    console.error('[turnstile] verify error:', e);
    return false;
  }
}
