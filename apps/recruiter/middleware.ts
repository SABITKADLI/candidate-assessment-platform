import type { NextRequest } from 'next/server';
import { auth0 } from './lib/auth0';

// Auth0 v4 handles /auth/* (login, callback, logout, access-token) and
// redirects unauthenticated users on protected paths. Public bypass list
// is kept tiny on purpose — recruiter plane is employees only.
export async function middleware(req: NextRequest) {
  return auth0.middleware(req);
}

export const config = {
  matcher: [
    // Everything except Next internals, health, and static assets.
    '/((?!_next/static|_next/image|favicon.ico|api/health).*)',
  ],
};
