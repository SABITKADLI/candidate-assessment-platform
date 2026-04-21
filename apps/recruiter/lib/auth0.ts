import { Auth0Client } from '@auth0/nextjs-auth0/server';

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

export const auth0Configured = Boolean(process.env.AUTH0_DOMAIN && process.env.AUTH0_CLIENT_ID);
