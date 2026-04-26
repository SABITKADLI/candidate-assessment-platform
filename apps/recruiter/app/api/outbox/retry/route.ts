import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { sql } from '@cap/db';
import { auth0, auth0Configured } from '@/lib/auth0';

const zBody = z.object({ id: z.string().uuid() });

export async function POST(req: NextRequest) {
  if (auth0Configured) {
    const session = await auth0.getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = zBody.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'invalid_id' }, { status: 400 });

  const result = await sql<{ id: string }[]>`
    UPDATE app.ats_outbox
    SET status         = 'pending',
        next_attempt_at = now(),
        last_error      = null,
        updated_at      = now()
    WHERE id = ${parsed.data.id}::uuid
      AND status IN ('failed', 'giveup')
    RETURNING id
  `;

  if (!result[0]) {
    return NextResponse.json({ error: 'not_found_or_not_retryable' }, { status: 404 });
  }
  return NextResponse.json({ ok: true, id: result[0].id });
}
