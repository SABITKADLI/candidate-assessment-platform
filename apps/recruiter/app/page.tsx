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
        <div style={{ width: '100%', maxWidth: 540 }}>
          {/* Header */}
          <div style={{ marginBottom: 28, textAlign: 'center' }}>
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 44,
              height: 44,
              background: 'var(--cap-accent)',
              borderRadius: 10,
              marginBottom: 16,
            }}>
              <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden>
                <path d="M5 8C5 6.34 6.34 5 8 5H11v2H8a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h3v2H8C6.34 17 5 15.66 5 14V8z" fill="#fff"/>
                <path d="M13 5h2.2l4.8 12H17.3l-.9-2.5h-2.8l-.9 2.5H11L13 5zm.9 3.8-1.1 4.2h2.2l-1.1-4.2z" fill="#fff"/>
              </svg>
            </div>
            <h1 style={{ margin: '0 0 6px', fontSize: 'var(--cap-text-xl)', fontWeight: 600 }}>
              Setup required
            </h1>
            <p style={{ margin: 0, fontSize: 'var(--cap-text-base)', color: 'var(--cap-fg-2)', lineHeight: 1.6 }}>
              Add these variables to{' '}
              <EnvVar name="apps/recruiter/.env.local" />
            </p>
          </div>

          <Card style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px 14px', borderBottom: '1px solid var(--cap-border)' }}>
              <p style={{ margin: 0, fontSize: 'var(--cap-text-xs)', fontWeight: 500, color: 'var(--cap-fg-3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Required environment variables
              </p>
            </div>
            <div>
              {SETUP_STEPS.map((step, i) => (
                <div
                  key={step.key}
                  style={{
                    padding: '14px 20px',
                    borderBottom: i < SETUP_STEPS.length - 1 ? '1px solid var(--cap-border)' : 'none',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 14,
                  }}
                >
                  <div style={{
                    width: 22, height: 22, borderRadius: '50%',
                    background: 'var(--cap-surface-2)',
                    border: '1px solid var(--cap-border)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 10, fontWeight: 600, color: 'var(--cap-fg-3)',
                    flexShrink: 0, marginTop: 1,
                  }}>
                    {i + 1}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <EnvVar name={step.key} />
                      <span style={{ fontSize: 'var(--cap-text-xs)', color: 'var(--cap-fg-2)' }}>{step.label}</span>
                    </div>
                    <div style={{
                      fontFamily: 'var(--cap-font-mono)', fontSize: 11,
                      color: 'var(--cap-fg-3)', background: 'var(--cap-surface-2)',
                      padding: '6px 10px', borderRadius: 'var(--cap-radius-sm)',
                      border: '1px solid var(--cap-border)',
                    }}>
                      {step.example}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <p style={{
            marginTop: 16, fontSize: 12, color: 'var(--cap-fg-3)', textAlign: 'center', lineHeight: 1.6,
          }}>
            Restart <EnvVar name="pnpm dev" /> after saving.
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
      <div style={{ width: '100%', maxWidth: 380 }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 44,
            height: 44,
            background: 'var(--cap-accent)',
            borderRadius: 10,
            marginBottom: 16,
          }}>
            <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden>
              <path d="M5 8C5 6.34 6.34 5 8 5H11v2H8a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h3v2H8C6.34 17 5 15.66 5 14V8z" fill="#fff"/>
              <path d="M13 5h2.2l4.8 12H17.3l-.9-2.5h-2.8l-.9 2.5H11L13 5zm.9 3.8-1.1 4.2h2.2l-1.1-4.2z" fill="#fff"/>
            </svg>
          </div>
          <h1 style={{ margin: '0 0 6px', fontSize: 'var(--cap-text-xl)', fontWeight: 600 }}>
            Recruiter console
          </h1>
          <p style={{ margin: 0, fontSize: 'var(--cap-text-base)', color: 'var(--cap-fg-2)' }}>
            Sign in to manage assessments
          </p>
        </div>

        <Card style={{ padding: 24 }}>
          <a href="/auth/login" style={{ textDecoration: 'none', display: 'block' }}>
            <Button variant="primary" size="lg" style={{ width: '100%' }}>
              Continue with SSO
            </Button>
          </a>
        </Card>

        <p style={{
          marginTop: 16, fontSize: 11, color: 'var(--cap-fg-3)', textAlign: 'center',
        }}>
          Access is restricted to authorized recruiters.
        </p>
      </div>
    </main>
  );
}
