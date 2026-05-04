import { sql } from '@cap/db';

export const dynamic = 'force-dynamic';

async function expireSessions(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return Response.json({ error: 'CRON_SECRET not configured' }, { status: 503 });
  }

  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${secret}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const [row] = await sql<[{ expire_sessions: number }]>`
      SELECT app.expire_sessions() AS expire_sessions
    `;
    const expired = row?.expire_sessions ?? 0;
    console.log(`[cron] expire-sessions: marked ${expired} session(s) as expired`);
    return Response.json({ ok: true, expired });
  } catch (e) {
    console.error('[cron] expire-sessions failed:', e);
    return Response.json({ ok: false, error: String(e) }, { status: 500 });
  }
}

export async function GET(req: Request) {
  return expireSessions(req);
}

export async function POST(req: Request) {
  return expireSessions(req);
}
