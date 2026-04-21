import { auth0, auth0Configured } from '@/lib/auth0';
import { sql } from '@cap/db';
import { Sidebar, StatCard } from '@cap/ui';

export const dynamic = 'force-dynamic';

export default async function Dashboard() {
  if (!auth0Configured) {
    return (
      <main style={{ padding: 'var(--cap-space-8)' }}>
        <h1>Dashboard</h1>
        <p>Auth0 not configured — see the home page for setup.</p>
      </main>
    );
  }
  if (!process.env.DATABASE_URL) {
    return (
      <main style={{ padding: 'var(--cap-space-8)' }}>
        <h1>Dashboard</h1>
        <p>DATABASE_URL not set in <code>apps/recruiter/.env.local</code>.</p>
      </main>
    );
  }
  const session = await auth0.getSession();
  const [counts] = await sql<{
    sessions: string; open_flags: string; completed_24h: string;
  }[]>`
    SELECT
      (SELECT count(*) FROM app.sessions)::text AS sessions,
      (SELECT count(*) FROM app.proctoring_flags WHERE resolved = false)::text AS open_flags,
      (SELECT count(*) FROM app.sessions WHERE completed_at > now() - interval '24 hours')::text
        AS completed_24h
  `;

  return (
    <div style={{ display: 'flex', minHeight: '100dvh' }}>
      <Sidebar
        activeId="dashboard"
        footer={
          <a href="/auth/logout" style={{
            display: 'block', padding: '8px 10px', fontSize: 13,
            color: 'var(--cap-fg-2)', textDecoration: 'none',
          }}>Sign out</a>
        }
      />
      <main style={{ flex: 1, padding: 'var(--cap-space-8)' }}>
        <header style={{ marginBottom: 'var(--cap-space-8)' }}>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 600 }}>Dashboard</h1>
          <p style={{
            margin: '4px 0 0', fontSize: 13, color: 'var(--cap-fg-2)',
          }}>
            Welcome, {session?.user.name ?? 'recruiter'}.
          </p>
        </header>
        <section style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: 'var(--cap-space-4)',
          maxWidth: 900,
        }}>
          <StatCard label="Total sessions" value={counts!.sessions} />
          <StatCard
            label="Open flags"
            value={counts!.open_flags}
            tone={Number(counts!.open_flags) > 0 ? 'warning' : 'default'}
          />
          <StatCard
            label="Completed · 24h"
            value={counts!.completed_24h}
            tone="success"
          />
        </section>
      </main>
    </div>
  );
}
