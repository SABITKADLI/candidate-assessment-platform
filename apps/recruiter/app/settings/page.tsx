import { redirect } from 'next/navigation';
import { auth0, auth0Configured } from '@/lib/auth0';
import { Sidebar, Card } from '@cap/ui';

export const dynamic = 'force-dynamic';

function ConfigRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'flex-start',
      gap: 16,
      padding: '11px 0',
      borderBottom: '1px solid var(--cap-border)',
    }}>
      <span style={{
        width: 180,
        flexShrink: 0,
        fontSize: 'var(--cap-text-xs)',
        color: 'var(--cap-fg-2)',
        fontWeight: 500,
        paddingTop: 2,
      }}>
        {label}
      </span>
      <span style={{
        fontSize: 12,
        fontFamily: 'var(--cap-font-mono)',
        color: 'var(--cap-fg-1)',
        wordBreak: 'break-all',
        flex: 1,
      }}>
        {value}
      </span>
    </div>
  );
}

function ConfigCard({ title, rows }: { title: string; rows: { label: string; value: string }[] }) {
  return (
    <Card style={{ marginBottom: 'var(--cap-space-4)', overflow: 'hidden' }}>
      <div style={{
        padding: '12px 20px',
        borderBottom: '1px solid var(--cap-border)',
        background: 'var(--cap-surface-2)',
      }}>
        <h2 style={{ margin: 0, fontSize: 12, fontWeight: 600, color: 'var(--cap-fg-2)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          {title}
        </h2>
      </div>
      <div style={{ padding: '0 20px' }}>
        {rows.map((r, i) => (
          <div key={r.label} style={{ borderBottom: i < rows.length - 1 ? '1px solid var(--cap-border)' : 'none' }}>
            <ConfigRow label={r.label} value={r.value} />
          </div>
        ))}
      </div>
    </Card>
  );
}

export default async function SettingsPage() {
  if (auth0Configured) {
    const session = await auth0.getSession();
    if (!session) redirect('/');
  }

  const configured = {
    auth0: auth0Configured,
    domain: process.env.AUTH0_DOMAIN ?? '—',
    clientId: process.env.AUTH0_CLIENT_ID ?? '—',
    appBaseUrl: process.env.APP_BASE_URL ?? '—',
    candidateBase: process.env.NEXT_PUBLIC_CANDIDATE_BASE_URL ?? '—',
    redisUrl: process.env.REDIS_URL ? process.env.REDIS_URL.replace(/\/\/.*@/, '//***@') : '—',
    memoModel: process.env.MEMO_MODEL ?? '—',
  };

  return (
    <div style={{ display: 'flex', minHeight: '100dvh' }}>
      <Sidebar activeId="settings" />

      <main id="main-content" style={{ flex: 1, padding: 'var(--cap-space-8)', minWidth: 0 }}>
        <div style={{ maxWidth: 640 }}>
          <header style={{ marginBottom: 'var(--cap-space-8)' }}>
            <h1 style={{ margin: '0 0 4px', fontSize: 'var(--cap-text-xl)', fontWeight: 600, letterSpacing: '-0.01em' }}>
              Settings
            </h1>
            <p style={{ margin: 0, fontSize: 'var(--cap-text-base)', color: 'var(--cap-fg-2)' }}>
              Environment configuration — read-only.
            </p>
          </header>

          <ConfigCard
            title="Auth0"
            rows={[
              { label: 'Configured', value: configured.auth0 ? 'Yes' : 'No — set AUTH0_DOMAIN + AUTH0_CLIENT_ID' },
              { label: 'Domain', value: configured.domain },
              { label: 'Client ID', value: configured.clientId },
              { label: 'App base URL', value: configured.appBaseUrl },
            ]}
          />

          <ConfigCard
            title="Services"
            rows={[
              { label: 'Candidate base URL', value: configured.candidateBase },
              { label: 'Redis URL', value: configured.redisUrl },
            ]}
          />

          <ConfigCard
            title="Scoring"
            rows={[
              { label: 'Memo model', value: configured.memoModel },
              { label: 'Anthropic API key', value: process.env.ANTHROPIC_API_KEY ? '*** set ***' : '— not set' },
            ]}
          />
        </div>
      </main>
    </div>
  );
}
