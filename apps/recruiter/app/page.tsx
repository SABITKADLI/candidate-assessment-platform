import { redirect } from 'next/navigation';
import { auth0, auth0Configured } from '@/lib/auth0';
import { Button, Card } from '@cap/ui';

/* ── Setup step list ─────────────────────────────────────────────── */
const SETUP_STEPS = [
  {
    key: 'AUTH0_DOMAIN',
    label: 'Auth0 Domain',
    example: 'your-tenant.us.auth0.com',
  },
  {
    key: 'AUTH0_CLIENT_ID',
    label: 'Client ID',
    example: 'abc123…',
  },
  {
    key: 'AUTH0_CLIENT_SECRET',
    label: 'Client Secret',
    example: 'secret…',
  },
  {
    key: 'AUTH0_SECRET',
    label: 'Session Secret',
    example: 'openssl rand -hex 32',
  },
  {
    key: 'APP_BASE_URL',
    label: 'App Base URL',
    example: 'http://localhost:3001',
  },
];

function CapWordmark() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 32 }}>
      <svg width="24" height="24" viewBox="0 0 28 28" fill="none" aria-hidden="true">
        <rect width="28" height="28" rx="6" fill="var(--cap-accent)" />
        <path d="M8 10.5C8 9.12 9.12 8 10.5 8H14v2h-3.5a.5.5 0 0 0-.5.5v7a.5.5 0 0 0 .5.5H14v2h-3.5C9.12 20 8 18.88 8 17.5v-7z" fill="#fff" />
        <path d="M15.5 8h1.6l3.4 12h-2.1l-.7-2.5H17l-.7 2.5H14.1L15.5 8zm.8 2.8-1 4.2h2l-1-4.2z" fill="#fff" />
      </svg>
      <span style={{
        fontSize: 13,
        fontWeight: 600,
        color: 'var(--cap-fg-1)',
        letterSpacing: '-0.01em',
      }}>
        CAP
        <span style={{
          marginLeft: 8,
          fontSize: 11,
          fontWeight: 400,
          color: 'var(--cap-fg-3)',
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
        }}>
          Recruiter console
        </span>
      </span>
    </div>
  );
}

function EnvVar({ name }: { name: string }) {
  return (
    <code style={{
      fontFamily: 'var(--cap-font-mono)',
      fontSize: 11,
      background: 'var(--cap-surface-2)',
      color: 'var(--cap-accent)',
      padding: '1px 6px',
      borderRadius: 'var(--cap-radius-sm)',
      border: '1px solid var(--cap-border)',
    }}>
      {name}
    </code>
  );
}

export default async function Home() {
  /* ── Not configured: show setup guide ───────────────────────────── */
  if (!auth0Configured) {
    return (
      <main
        id="main-content"
        style={{
          minHeight: '100dvh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 'var(--cap-space-6)',
          background: 'var(--cap-bg)',
        }}
      >
        <div style={{ width: '100%', maxWidth: 520 }}>
          <CapWordmark />

          <h1 style={{
            margin: '0 0 6px',
            fontSize: 'var(--cap-text-xl)',
            fontWeight: 600,
            letterSpacing: '-0.02em',
            lineHeight: 1.25,
            color: 'var(--cap-fg-1)',
          }}>
            Setup required
          </h1>
          <p style={{
            margin: '0 0 24px',
            fontSize: 'var(--cap-text-base)',
            color: 'var(--cap-fg-2)',
            lineHeight: 1.65,
          }}>
            Add these variables to <EnvVar name="apps/recruiter/.env.local" />, then restart.
          </p>

          <Card style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{
              padding: '12px 16px',
              borderBottom: '1px solid var(--cap-border)',
              background: 'var(--cap-surface-2)',
            }}>
              <span style={{
                fontSize: 'var(--cap-text-xs)',
                fontWeight: 500,
                color: 'var(--cap-fg-3)',
                textTransform: 'uppercase',
                letterSpacing: '0.07em',
              }}>
                Environment variables
              </span>
            </div>
            <div>
              {SETUP_STEPS.map((step, i) => (
                <div
                  key={step.key}
                  style={{
                    padding: '12px 16px',
                    borderBottom: i < SETUP_STEPS.length - 1 ? '1px solid var(--cap-border)' : 'none',
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: 12,
                    alignItems: 'start',
                  }}
                >
                  <div>
                    <EnvVar name={step.key} />
                    <div style={{
                      marginTop: 4,
                      fontSize: 'var(--cap-text-xs)',
                      color: 'var(--cap-fg-3)',
                    }}>
                      {step.label}
                    </div>
                  </div>
                  <div style={{
                    fontFamily: 'var(--cap-font-mono)',
                    fontSize: 11,
                    color: 'var(--cap-fg-2)',
                    background: 'var(--cap-surface-2)',
                    padding: '5px 8px',
                    borderRadius: 'var(--cap-radius-sm)',
                    border: '1px solid var(--cap-border)',
                    wordBreak: 'break-all',
                  }}>
                    {step.example}
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <p style={{
            marginTop: 14,
            fontSize: 12,
            color: 'var(--cap-fg-3)',
            lineHeight: 1.6,
          }}>
            Run <EnvVar name="pnpm dev" /> after saving to apply changes.
          </p>
        </div>
      </main>
    );
  }

  /* ── Configured: redirect if already signed in ──────────────────── */
  const session = await auth0.getSession();
  if (session) redirect('/dashboard');

  /* ── Sign-in page ───────────────────────────────────────────────── */
  return (
    <main
      id="main-content"
      style={{
        minHeight: '100dvh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'var(--cap-space-6)',
        background: 'var(--cap-bg)',
      }}
    >
      <div style={{ width: '100%', maxWidth: 360 }}>
        <CapWordmark />

        <h1 style={{
          margin: '0 0 6px',
          fontSize: 'var(--cap-text-xl)',
          fontWeight: 600,
          letterSpacing: '-0.02em',
          lineHeight: 1.25,
          color: 'var(--cap-fg-1)',
        }}>
          Sign in
        </h1>
        <p style={{
          margin: '0 0 24px',
          fontSize: 'var(--cap-text-base)',
          color: 'var(--cap-fg-2)',
          lineHeight: 1.6,
        }}>
          Access is restricted to authorized recruiters.
        </p>

        <a href="/auth/login" style={{ textDecoration: 'none', display: 'block' }}>
          <Button variant="primary" size="lg" style={{ width: '100%' }}>
            Continue with SSO
          </Button>
        </a>

        <p style={{
          marginTop: 20,
          fontSize: 11,
          color: 'var(--cap-fg-3)',
          lineHeight: 1.6,
        }}>
          Single sign-on via Auth0. Contact your administrator if you need access.
        </p>
      </div>
    </main>
  );
}
