import { redirect } from 'next/navigation';
import { auth0, auth0Configured } from '@/lib/auth0';
import { Sidebar, Card } from '@cap/ui';

export const dynamic = 'force-dynamic';

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 16, padding: '10px 0', borderBottom: '1px solid var(--cap-border)' }}>
      <span style={{ width: 180, flexShrink: 0, fontSize: 12, color: 'var(--cap-fg-3)', fontWeight: 500 }}>{label}</span>
      <span style={{ fontSize: 13, fontFamily: 'var(--cap-font-mono)', color: 'var(--cap-fg-1)', wordBreak: 'break-all' }}>{value}</span>
    </div>
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
      <main style={{ flex: 1, padding: 'var(--cap-space-8)', maxWidth: 700 }}>
        <header style={{ marginBottom: 'var(--cap-space-8)' }}>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 600 }}>Settings</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--cap-fg-2)' }}>
            Current environment configuration — read-only.
          </p>
        </header>

        <Card style={{ padding: 'var(--cap-space-6)', marginBottom: 'var(--cap-space-6)' }}>
          <h2 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 600 }}>Auth0</h2>
          <Row label="Configured" value={configured.auth0 ? 'Yes' : 'No — set AUTH0_DOMAIN + AUTH0_CLIENT_ID'} />
          <Row label="Domain" value={configured.domain} />
          <Row label="Client ID" value={configured.clientId} />
          <Row label="App base URL" value={configured.appBaseUrl} />
        </Card>

        <Card style={{ padding: 'var(--cap-space-6)', marginBottom: 'var(--cap-space-6)' }}>
          <h2 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 600 }}>Services</h2>
          <Row label="Candidate base URL" value={configured.candidateBase} />
          <Row label="Redis URL" value={configured.redisUrl} />
        </Card>

        <Card style={{ padding: 'var(--cap-space-6)' }}>
          <h2 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 600 }}>Scoring</h2>
          <Row label="Memo model" value={configured.memoModel} />
          <Row label="Anthropic API key" value={process.env.ANTHROPIC_API_KEY ? '***set***' : '— not set'} />
        </Card>
      </main>
    </div>
  );
}
