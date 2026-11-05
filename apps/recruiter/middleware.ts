import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { auth0, auth0Configuration } from './lib/auth0';

export async function middleware(req: NextRequest) {
  if (!auth0Configuration.configured) {
    console.error('[auth0] Incomplete or invalid configuration', auth0Configuration);
    if (req.nextUrl.pathname === '/') return NextResponse.next();
    return new NextResponse('Authentication service unavailable', { status: 503 });
  }
  return auth0.middleware(req);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/health).*)'],
};
