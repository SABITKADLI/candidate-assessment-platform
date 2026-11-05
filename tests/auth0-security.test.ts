import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getAuth0Configuration,
  getRecruiterAccess,
} from '../apps/recruiter/lib/auth-security.ts';

const completeEnv = {
  AUTH0_DOMAIN: 'tenant.us.auth0.com',
  AUTH0_CLIENT_ID: 'client-id',
  AUTH0_CLIENT_SECRET: 'client-secret',
  AUTH0_SECRET: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
  APP_BASE_URL: 'https://recruiter.example.com',
};

test('Auth0 is disabled when any required v4 setting is missing', () => {
  const config = getAuth0Configuration({ ...completeEnv, AUTH0_CLIENT_SECRET: '' });

  assert.equal(config.configured, false);
  assert.deepEqual(config.missing, ['AUTH0_CLIENT_SECRET']);
});

test('Auth0 accepts a complete valid v4 configuration', () => {
  const config = getAuth0Configuration(completeEnv);

  assert.equal(config.configured, true);
  assert.deepEqual(config.missing, []);
});

test('Auth0 rejects malformed domains, secrets, and application URLs', () => {
  const config = getAuth0Configuration({
    ...completeEnv,
    AUTH0_DOMAIN: 'https://tenant.us.auth0.com/',
    AUTH0_SECRET: 'too-short',
    APP_BASE_URL: 'tenant.example.com',
  });

  assert.equal(config.configured, false);
  assert.deepEqual(config.invalid, ['AUTH0_DOMAIN', 'AUTH0_SECRET', 'APP_BASE_URL']);
});

test('recruiter access fails closed when Auth0 is not configured', async () => {
  let sessionLookupCalled = false;
  const access = await getRecruiterAccess(
    {},
    async () => {
      sessionLookupCalled = true;
      return { user: { sub: 'auth0|user' } };
    },
  );

  assert.deepEqual(access, { status: 'misconfigured' });
  assert.equal(sessionLookupCalled, false);
});

test('recruiter access rejects missing sessions and accepts authenticated users', async () => {
  assert.deepEqual(
    await getRecruiterAccess(completeEnv, async () => null),
    { status: 'unauthorized' },
  );
  assert.deepEqual(
    await getRecruiterAccess(completeEnv, async () => ({ user: { sub: 'auth0|user' } })),
    { status: 'authenticated', session: { user: { sub: 'auth0|user' } } },
  );
});
