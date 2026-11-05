import { Auth0Client } from '@auth0/nextjs-auth0/server';
import { NextResponse } from 'next/server';
import { getAuth0Configuration, getRecruiterAccess } from './auth-security';

let _client: Auth0Client | null = null;
function get(): Auth0Client {
  if (_client) return _client;
  _client = new Auth0Client();
  return _client;
}

export const auth0 = new Proxy({} as Auth0Client, {
  get(_t, prop, receiver) {
    return Reflect.get(get(), prop, receiver);
  },
});

export const auth0Configuration = getAuth0Configuration(process.env);
export const auth0Configured = auth0Configuration.configured;

export async function recruiterAccess() {
  return getRecruiterAccess(process.env, () => auth0.getSession());
}

export async function requireRecruiterApiSession() {
  const access = await recruiterAccess();
  if (access.status === 'misconfigured') {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: 'authentication_unavailable' },
        { status: 503 },
      ),
    };
  }
  if (access.status === 'unauthorized') {
    return {
      ok: false as const,
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    };
  }
  return { ok: true as const, session: access.session };
}
