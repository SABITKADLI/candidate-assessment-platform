import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { sql } from '@cap/db';
import { zResumeToken } from '@cap/shared/schemas';
import type { SessionStatus, StageGroup } from '@cap/shared/enums';

type SessionRow = {
  id: string;
  stage: StageGroup;
  status: SessionStatus;
  expires_at: Date;
};

/**
 * Entry point for a candidate arriving with a signed invitation link.
 *
 * Responsibilities:
 *   1. Validate token shape (cheap, no DB hit on malformed).
 *   2. Look up the session; refuse if missing, expired, or terminal.
 *   3. Mint a short-lived httpOnly cookie so middleware can gate /app/* pages.
 *   4. Hand off to the first unfinished stage.
 */
export default async function StageEntry({
  params,
}: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const parsed = zResumeToken.safeParse(token);
  if (!parsed.success) redirect('/?reason=bad_token');

  const rows = await sql<SessionRow[]>`
    SELECT id, stage, status, expires_at
    FROM app.sessions
    WHERE resume_token = ${token}
    LIMIT 1
  `;
  const session = rows[0];
  if (!session) redirect('/?reason=not_found');
  if (session.expires_at < new Date()) redirect('/?reason=expired');
  if (['completed', 'expired', 'abandoned', 'disqualified'].includes(session.status)) {
    redirect(`/?reason=${session.status}`);
  }

  const jar = await cookies();
  jar.set('cap_sess', session.id, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    // Shorter than expires_at; refreshed on each stage transition.
    maxAge: 60 * 60,
  });

  // TODO: route by stage_attempts progress; placeholder for now.
  return (
    <main style={{ fontFamily: 'system-ui', padding: 48 }}>
      <h1>Welcome</h1>
      <p>Stage {session.stage} session bound. Routing to first step…</p>
    </main>
  );
}
