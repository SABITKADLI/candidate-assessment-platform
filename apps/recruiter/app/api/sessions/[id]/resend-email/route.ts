import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@cap/db';
import { auth0, auth0Configured } from '@/lib/auth0';
import { sendInviteEmail } from '@/lib/sendInviteEmail';

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (auth0Configured) {
    const session = await auth0.getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: 'Invalid session id' }, { status: 400 });
  }

  const [row] = await sql<{
    email: string | null;
    resume_token: string;
    expires_at: Date;
    stage: string;
  }[]>`
    SELECT c.email, s.resume_token, s.expires_at, s.stage::text AS stage
    FROM app.sessions s
    JOIN app.candidates c ON c.id = s.candidate_id
    WHERE s.id = ${id}::uuid
  `;

  if (!row) return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  if (!row.email) return NextResponse.json({ error: 'No email on record for this candidate' }, { status: 422 });
  if (row.expires_at < new Date()) return NextResponse.json({ error: 'Session has expired' }, { status: 422 });

  const base = process.env.NEXT_PUBLIC_CANDIDATE_BASE_URL ?? 'http://localhost:3000';
  const inviteUrl = `${base}/s/${row.resume_token}`;
  const stage = (row.stage === 'A' || row.stage === 'B') ? row.stage : 'A';

  await sendInviteEmail({
    to: row.email,
    inviteUrl,
    stage,
    expiresAt: row.expires_at,
    sessionId: id,
  });

  return NextResponse.json({ ok: true });
}
