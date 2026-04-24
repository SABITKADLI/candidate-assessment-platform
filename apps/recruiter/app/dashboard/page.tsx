import { auth0, auth0Configured } from '@/lib/auth0';
import { sql } from '@cap/db';
import { Sidebar, StatCard, Button, Card } from '@cap/ui';
import type { SessionStatus } from '@cap/shared/enums';
import {
  Users,
  AlertTriangle,
  CheckCircle2,
  TrendingUp,
  ExternalLink,
} from 'lucide-react';

export const dynamic = 'force-dynamic';

type RecentSession = {
  id: string;
  email: string | null;
  status: SessionStatus;
  stage: string;
  created_at: Date;
};

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  pending:      { label: 'Pending',      color: 'var(--cap-fg-2)' },
  in_progress:  { label: 'In progress',  color: 'var(--cap-accent)' },
  paused:       { label: 'Paused',       color: 'var(--cap-warning)' },
  completed:    { label: 'Completed',    color: 'var(--cap-success)' },
  disqualified: { label: 'Disqualified', color: 'var(--cap-danger)' },
  expired:      { label: 'Expired',      color: 'var(--cap-fg-3)' },
  abandoned:    { label: 'Abandoned',    color: 'var(--cap-fg-3)' },
};

export default async function Dashboard() {
  if (!auth0Configured) {
    return (
      <main id="main-content" style={{ padding: 'var(--cap-space-8)' }}>
        <h1 style={{ margin: '0 0 8px', fontSize: 'var(--cap-text-xl)', fontWeight: 600 }}>Dashboard</h1>
        <p style={{ color: 'var(--cap-fg-2)', fontSize: 'var(--cap-text-base)' }}>
          Auth0 not configured — see the home page for setup.
        </p>
      </main>
    );
  }

  if (!process.env.DATABASE_URL) {
    return (
      <main id="main-content" style={{ padding: 'var(--cap-space-8)' }}>
        <h1 style={{ margin: '0 0 8px', fontSize: 'var(--cap-text-xl)', fontWeight: 600 }}>Dashboard</h1>
        <p style={{ color: 'var(--cap-fg-2)', fontSize: 'var(--cap-text-base)' }}>
          DATABASE_URL not set in <code style={{ fontFamily: 'var(--cap-font-mono)' }}>apps/recruiter/.env.local</code>.
        </p>
      </main>
    );
  }

  const authSession = await auth0.getSession();
  const [counts] = await sql<{
    sessions: string; open_flags: string; completed_24h: string; in_progress: string;
  }[]>`
    SELECT
      (SELECT count(*) FROM app.sessions)::text AS sessions,
      (SELECT count(*) FROM app.proctoring_flags WHERE resolved = false)::text AS open_flags,
      (SELECT count(*) FROM app.sessions WHERE completed_at > now() - interval '24 hours')::text AS completed_24h,
      (SELECT count(*) FROM app.sessions WHERE status = 'in_progress')::text AS in_progress
  `;

  const recent = await sql<RecentSession[]>`
    SELECT s.id, c.email, s.status::text AS status, s.stage::text AS stage, s.created_at
    FROM app.sessions s
    JOIN app.candidates c ON c.id = s.candidate_id
    ORDER BY s.created_at DESC
    LIMIT 8
  `;

  const flagCount = Number(counts!.open_flags);
  const firstName = authSession?.user.name?.split(' ')[0] ?? 'there';

  return (
    <div style={{ display: 'flex', minHeight: '100dvh' }}>
      <Sidebar
        activeId="dashboard"
        footer={
          <a
            href="/auth/logout"
            className="cap-sidebar-item"
            style={{ textDecoration: 'none' }}
          >
            Sign out
          </a>
        }
      />

      <main id="main-content" style={{ flex: 1, padding: 'var(--cap-space-8)', minWidth: 0 }}>
        {/* Page header */}
        <header style={{
          marginBottom: 'var(--cap-space-8)',
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 16,
        }}>
          <div>
            <h1 style={{ margin: '0 0 4px', fontSize: 'var(--cap-text-xl)', fontWeight: 600, letterSpacing: '-0.01em' }}>
              Good to see you, {firstName}
            </h1>
            <p style={{ margin: 0, fontSize: 'var(--cap-text-base)', color: 'var(--cap-fg-2)' }}>
              Here's what's happening with your assessments today.
            </p>
          </div>
          <a href="/dashboard/new" style={{ textDecoration: 'none', flexShrink: 0 }}>
            <Button variant="primary">New session</Button>
          </a>
        </header>

        {/* Stat cards */}
        <section
          aria-label="Key metrics"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: 'var(--cap-space-4)',
            maxWidth: 900,
            marginBottom: 'var(--cap-space-8)',
          }}
        >
          <StatCard
            label="Total sessions"
            value={counts!.sessions}
            icon={<Users size={16} strokeWidth={1.5} />}
          />
          <StatCard
            label="In progress"
            value={counts!.in_progress}
            icon={<TrendingUp size={16} strokeWidth={1.5} />}
          />
          <StatCard
            label="Completed · 24h"
            value={counts!.completed_24h}
            tone="success"
            icon={<CheckCircle2 size={16} strokeWidth={1.5} />}
          />
          <StatCard
            label="Open flags"
            value={counts!.open_flags}
            tone={flagCount > 0 ? 'warning' : 'default'}
            sub={flagCount > 0 ? 'Needs review' : undefined}
            icon={<AlertTriangle size={16} strokeWidth={1.5} />}
          />
        </section>

        {/* Recent sessions */}
        <section aria-labelledby="recent-heading">
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            marginBottom: 12,
          }}>
            <h2 id="recent-heading" style={{ margin: 0, fontSize: 13, fontWeight: 600, color: 'var(--cap-fg-1)' }}>
              Recent sessions
            </h2>
            <a href="/sessions" style={{ fontSize: 12, color: 'var(--cap-accent)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}>
              View all <ExternalLink size={11} strokeWidth={2} />
            </a>
          </div>

          <Card>
            {recent.length === 0 ? (
              <div style={{ padding: '32px 24px', textAlign: 'center' }}>
                <p style={{ margin: 0, fontSize: 13, color: 'var(--cap-fg-3)' }}>No sessions yet.</p>
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr>
                    {['Candidate', 'Stage', 'Status', 'Created'].map((h) => (
                      <th
                        key={h}
                        scope="col"
                        style={{
                          padding: '10px 16px',
                          textAlign: 'left',
                          fontSize: 'var(--cap-text-xs)',
                          fontWeight: 600,
                          color: 'var(--cap-fg-3)',
                          textTransform: 'uppercase',
                          letterSpacing: '0.05em',
                          borderBottom: '1px solid var(--cap-border)',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {recent.map((s) => {
                    const st = STATUS_LABEL[s.status] ?? { label: s.status, color: 'var(--cap-fg-2)' };
                    return (
                      <tr key={s.id} className="cap-table-row">
                        <td style={{ padding: '10px 16px', color: 'var(--cap-fg-1)' }}>
                          {s.email ?? <span style={{ color: 'var(--cap-fg-3)' }}>—</span>}
                        </td>
                        <td style={{ padding: '10px 16px', fontFamily: 'var(--cap-font-mono)', fontSize: 11, color: 'var(--cap-fg-2)' }}>
                          Stage {s.stage}
                        </td>
                        <td style={{ padding: '10px 16px' }}>
                          <span style={{
                            fontSize: 11, fontWeight: 500,
                            color: st.color,
                            fontFamily: 'var(--cap-font-mono)',
                          }}>
                            {st.label}
                          </span>
                        </td>
                        <td style={{ padding: '10px 16px', fontFamily: 'var(--cap-font-mono)', fontSize: 11, color: 'var(--cap-fg-2)', whiteSpace: 'nowrap' }}>
                          {s.created_at.toISOString().slice(0, 10)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </Card>
        </section>
      </main>
    </div>
  );
}
