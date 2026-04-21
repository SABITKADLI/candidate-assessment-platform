import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@cap/db';
import { zResumeToken } from '@cap/shared/schemas';
import type { SessionStatus, StageGroup, StageKey } from '@cap/shared/enums';
import { turnstileEnabled } from '@/lib/turnstile';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Stage order per group. Router picks the first stage without a completed
// attempt; if all done, we send back to '/'.
const ORDER: Record<StageGroup, StageKey[]> = {
  A: ['A_RESUME','A_ID_LIVENESS','A_GMA','A_BIG5','A_MBTI','A_RORSCHACH','A_INTEGRITY','A_SJT'],
  B: ['B_CODING','B_DEBUG','B_WORK_SAMPLE','B_ASYNC_VIDEO','B_VERBAL'],
};

// MVP: only A_GMA has a real UI. Others redirect to /welcome.
const STAGE_ROUTES: Partial<Record<StageKey, string>> = {
  A_GMA: 'a_gma',
};

type SessionRow = {
  id: string;
  stage: StageGroup;
  status: SessionStatus;
  expires_at: Date;
};

export async function GET(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const parsed = zResumeToken.safeParse(token);
  if (!parsed.success) return redirect(req, '/?reason=bad_token');

  const rows = await sql<SessionRow[]>`
    SELECT id, stage, status, expires_at
    FROM app.sessions
    WHERE resume_token = ${token}
    LIMIT 1
  `;
  const session = rows[0];
  if (!session) return redirect(req, '/?reason=not_found');
  if (session.expires_at < new Date()) return redirect(req, '/?reason=expired');
  if (['completed','expired','abandoned','disqualified'].includes(session.status)) {
    return redirect(req, `/?reason=${session.status}`);
  }

  // Turnstile gate. If configured and the caller hasn't proven humanity yet,
  // bounce to the challenge page. Soft-fail in dev (turnstileEnabled=false)
  // just falls through to the session mint below.
  if (turnstileEnabled && !req.cookies.get('cap_turnstile')?.value) {
    return NextResponse.redirect(new URL(`/s/${token}/challenge`, req.url));
  }

  // Find next unfinished stage.
  const done = await sql<{ stage_key: StageKey }[]>`
    SELECT stage_key FROM app.stage_attempts
    WHERE session_id = ${session.id}::uuid AND completed_at IS NOT NULL
  `;
  const doneSet = new Set(done.map((d) => d.stage_key));
  const next = ORDER[session.stage].find((k) => !doneSet.has(k));

  const dest = next && STAGE_ROUTES[next]
    ? `/s/${token}/${STAGE_ROUTES[next]}`
    : `/s/${token}/welcome`;

  const res = NextResponse.redirect(new URL(dest, req.url));
  res.cookies.set('cap_sess', session.id, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60,
  });
  return res;
}

function redirect(req: NextRequest, path: string) {
  return NextResponse.redirect(new URL(path, req.url));
}
