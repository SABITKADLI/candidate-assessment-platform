import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@cap/db';
import { zResumeToken } from '@cap/shared/schemas';
import type { SessionStatus, StageGroup, StageKey } from '@cap/shared/enums';
import { turnstileEnabled } from '@/lib/turnstile';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const DEFAULT_ORDER: Record<StageGroup, StageKey[]> = {
  A: ['A_RESUME','A_ID_LIVENESS','A_GMA','A_BIG5','A_MBTI','A_RORSCHACH','A_INTEGRITY','A_SJT'],
  B: ['B_CODING','B_DEBUG','B_WORK_SAMPLE','B_ASYNC_VIDEO','B_VERBAL'],
};

const STAGE_ROUTES: Partial<Record<StageKey, string>> = {
  A_RESUME: 'a_resume',
  A_ID_LIVENESS: 'a_id_liveness',
  A_GMA: 'a_gma',
  A_BIG5: 'a_big5',
  A_MBTI: 'a_mbti',
  A_RORSCHACH: 'a_rorschach',
  A_INTEGRITY: 'a_integrity',
  A_SJT: 'a_sjt',
  B_CODING: 'b_coding',
  B_DEBUG: 'b_debug',
  B_WORK_SAMPLE: 'b_work_sample',
  B_ASYNC_VIDEO: 'b_async_video',
  B_VERBAL: 'b_verbal',
};

type SessionRow = {
  id: string;
  stage: StageGroup;
  status: SessionStatus;
  expires_at: Date;
  stages_a: string[] | null;
  stages_b: string[] | null;
};

export async function GET(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const parsed = zResumeToken.safeParse(token);
  if (!parsed.success) return redirect(req, '/?reason=bad_token');

  const rows = await sql<SessionRow[]>`
    SELECT s.id, s.stage, s.status, s.expires_at,
           r.stages_a, r.stages_b
    FROM app.sessions s
    LEFT JOIN app.roles r ON r.id = s.role_id
    WHERE s.resume_token = ${token}
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

  // Use role-specific stage order when set; otherwise fall back to defaults.
  const stageOrder: StageKey[] = session.stage === 'A'
    ? ((session.stages_a ?? DEFAULT_ORDER.A) as StageKey[])
    : ((session.stages_b ?? DEFAULT_ORDER.B) as StageKey[]);

  // Find next unfinished stage.
  const done = await sql<{ stage_key: StageKey }[]>`
    SELECT stage_key FROM app.stage_attempts
    WHERE session_id = ${session.id}::uuid AND completed_at IS NOT NULL
  `;
  const doneSet = new Set(done.map((d) => d.stage_key));
  const next = stageOrder.find((k) => !doneSet.has(k));

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
