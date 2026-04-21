import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { auth0, auth0Configured } from './lib/auth0';

export async function middleware(req: NextRequest) {
  if (!auth0Configured) return NextResponse.next();
  return auth0.middleware(req);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/health).*)'],
};
