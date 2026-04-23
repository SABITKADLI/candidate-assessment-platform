import { type NextRequest, NextResponse } from 'next/server';
import { sql } from '@cap/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Call via: GET /api/cron/expire
// Header:   Authorization: Bearer <CRON_SECRET>
// Schedule with Vercel Cron, GitHub Actions, or any external scheduler.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 503 });
  }
  if (req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const [row] = await sql<{ n: string }[]>`SELECT app.expire_sessions()::text AS n`;
  return NextResponse.json({ ok: true, expired: Number(row?.n ?? 0) });
}
