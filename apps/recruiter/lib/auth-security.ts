export const AUTH0_REQUIRED_ENV = [
  'AUTH0_DOMAIN',
  'AUTH0_CLIENT_ID',
  'AUTH0_CLIENT_SECRET',
  'AUTH0_SECRET',
  'APP_BASE_URL',
] as const;

type Auth0EnvKey = typeof AUTH0_REQUIRED_ENV[number];
type Environment = Record<string, string | undefined>;

export type Auth0Configuration = {
  configured: boolean;
  missing: Auth0EnvKey[];
  invalid: Auth0EnvKey[];
};

export function getAuth0Configuration(env: Environment): Auth0Configuration {
  const missing = AUTH0_REQUIRED_ENV.filter((key) => !env[key]?.trim());
  const invalid: Auth0EnvKey[] = [];

  if (env.AUTH0_DOMAIN?.trim() && !isValidAuth0Domain(env.AUTH0_DOMAIN)) {
    invalid.push('AUTH0_DOMAIN');
  }
  if (env.AUTH0_SECRET?.trim() && env.AUTH0_SECRET.trim().length < 32) {
    invalid.push('AUTH0_SECRET');
  }
  if (env.APP_BASE_URL?.trim() && !isValidAbsoluteUrl(env.APP_BASE_URL)) {
    invalid.push('APP_BASE_URL');
  }

  return { configured: missing.length === 0 && invalid.length === 0, missing, invalid };
}

function isValidAuth0Domain(value: string): boolean {
  const domain = value.trim();
  return !domain.includes('://') && !domain.includes('/') && /^[a-z0-9.-]+$/i.test(domain);
}

function isValidAbsoluteUrl(value: string): boolean {
  try {
    const url = new URL(value.trim());
    return (url.protocol === 'https:' || url.protocol === 'http:') && Boolean(url.hostname);
  } catch {
    return false;
  }
}

type RecruiterSession = {
  user: {
    sub?: string;
    name?: string;
    email?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

export type RecruiterAccess =
  | { status: 'misconfigured' }
  | { status: 'unauthorized' }
  | { status: 'authenticated'; session: RecruiterSession };

export async function getRecruiterAccess(
  env: Environment,
  getSession: () => Promise<RecruiterSession | null | undefined>,
): Promise<RecruiterAccess> {
  if (!getAuth0Configuration(env).configured) return { status: 'misconfigured' };
  const session = await getSession();
  if (!session) return { status: 'unauthorized' };
  return { status: 'authenticated', session };
}
