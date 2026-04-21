import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { sql, auditLog } from '@cap/db';
import { zResumeToken } from '@cap/shared/schemas';
import { verifyTurnstile } from '@/lib/turnstile';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const zBody = z.object({
  token: z.string().min(1).max(2048),
  resume_token: zResumeToken,
});

export async function POST(req: NextRequest) {
  let body: unknown;
  try { body = await req.json(); } catch { return bad('bad_json'); }
  const parsed = zBody.safeParse(body);
  if (!parsed.success) return bad('bad_shape');

  // Resolve the session first; fail fast on bad/expired tokens even before
  // hitting Cloudflare. Prevents Turnstile credit burn on junk traffic.
  const rows = await sql<Array<{ id: string; expires_at: Date; status: string }>>`
    SELECT id, expires_at, status::text AS status
    FROM app.sessions WHERE resume_token = ${parsed.data.resume_token} LIMIT 1
  `;
  const s = rows[0];
  if (!s) return bad('not_found', 404);
  if (s.expires_at < new Date()) return bad('expired', 410);
  if (['completed','expired','abandoned','disqualified'].includes(s.status)) {
    return bad(`session_${s.status}`, 410);
  }

  const ip = (req.headers.get('cf-connecting-ip')
    ?? req.headers.get('x-forwarded-for')?.split(',')[0]
    ?? '').trim() || undefined;

  const ok = await verifyTurnstile(parsed.data.token, ip);
  if (!ok) {
    await auditLog('candidate-app', 'turnstile.fail',
      `session:${s.id}`, { ip_hash: ip ? hash(ip) : null });
    return bad('verify_failed', 403);
  }

  await auditLog('candidate-app', 'turnstile.pass',
    `session:${s.id}`, { ip_hash: ip ? hash(ip) : null });

  const res = NextResponse.json({
    ok: true,
    redirect: `/s/${parsed.data.resume_token}`,
  });
  res.cookies.set('cap_turnstile', '1', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60,  // 1h; matches cap_sess TTL
  });
  return res;
}

function bad(reason: string, status = 400) {
  return new Response(JSON.stringify({ error: reason }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// Cheap, non-cryptographic IP fingerprint. We never want to store raw IPs
// in audit logs for privacy; hash is sufficient for duplicate-attack detection.
function hash(s: string): string {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h.toString(16).padStart(8, '0');
}
