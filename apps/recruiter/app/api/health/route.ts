import { sql } from '@cap/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await sql`SELECT 1`;
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
