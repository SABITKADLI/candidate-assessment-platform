import { NextRequest, NextResponse } from 'next/server';

// Auth boundary for the candidate app.
//
// Model: candidates never log in. Every assessment URL carries an opaque
// `resume_token` (validated shape in @cap/shared). The middleware enforces
// presence/shape only; per-token DB checks (expiry, status, IP binding)
// happen inside the `/s/[token]` route so we can render a proper error page.
//
// Public paths: marketing root, healthcheck, stage-token entry, and the two
// Turnstile endpoints that run before a session cookie is ever minted.
const PUBLIC = [
  /^\/$/,
  /^\/api\/health$/,
  /^\/api\/health\/queues$/,
  /^\/api\/cron\/expire$/,
  /^\/api\/turnstile\/verify$/,
  /^\/s\/[A-Za-z0-9_-]+$/,
  /^\/s\/[A-Za-z0-9_-]+\/challenge$/,
];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC.some((re) => re.test(pathname))) return NextResponse.next();

  // Any other path requires a session cookie set by /s/[token] after validation.
  const sess = req.cookies.get('cap_sess')?.value;
  if (!sess) {
    const url = req.nextUrl.clone();
    url.pathname = '/';
    url.searchParams.set('reason', 'no_session');
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
