import { auth0Configured } from '@/lib/auth0';
import { requireRecruiterSession } from '@/lib/requireAuth';
import { sql } from '@cap/db';
import { Sidebar, StatCard, Button, Card, StatusBadge } from '@cap/ui';
import type { SessionStatus } from '@cap/shared/enums';
import {
  Users,
  AlertTriangle,
  CheckCircle2,
  Activity,
  ArrowRight,
} from 'lucide-react';

export const dynamic = 'force-dynamic';

type RecentSession = {
  id: string;
  email: string | null;
  status: SessionStatus;
  stage: string;
  created_at: Date;
};

const TH_STYLE = {
  padding: '10px 16px',
  textAlign: 'left' as const,
  fontSize: '11px',
  fontWeight: 500,
  color: 'var(--cap-fg-2)',
  textTransform: 'uppercase' as const,
  letterSpacing: '0.07em',
  borderBottom: '1px solid var(--cap-border)',
  whiteSpace: 'nowrap' as const,
  background: 'var(--cap-surface)',
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

  const authSession = await requireRecruiterSession();
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

      <main id="main-content" className="cap-main" style={{ flex: 1, padding: 'var(--cap-space-8)', minWidth: 0 }}>
        {/* Page header — utilitarian, data-first */}
        <header style={{
          marginBottom: 'var(--cap-space-8)',
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 16,
        }}>
          <div>
            <h1 style={{
              margin: '0 0 3px',
              fontSize: 'var(--cap-text-xl)',
              fontWeight: 600,
              letterSpacing: '-0.02em',
              lineHeight: 1.25,
              color: 'var(--cap-fg-1)',
            }}>
              Dashboard
            </h1>
            <p style={{
              margin: 0,
              fontSize: 'var(--cap-text-base)',
              color: 'var(--cap-fg-3)',
              fontFamily: 'var(--cap-font-mono)',
            }}>
              {firstName}
            </p>
          </div>
          <a href="/dashboard/new" style={{ textDecoration: 'none', flexShrink: 0 }}>
            <Button variant="primary" size="lg">New session</Button>
          </a>
        </header>

        {/* Stat grid — horizontal data rows, not hero metric cards */}
        <section
          aria-label="Key metrics"
          className="cap-stats-grid"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: 'var(--cap-space-3)',
            maxWidth: 860,
            marginBottom: 'var(--cap-space-8)',
          }}
        >
          <StatCard
            label="Total sessions"
            value={counts!.sessions}
            icon={<Users size={14} strokeWidth={1.5} />}
          />
          <StatCard
            label="In progress"
            value={counts!.in_progress}
            icon={<Activity size={14} strokeWidth={1.5} />}
          />
          <StatCard
            label="Completed · 24h"
            value={counts!.completed_24h}
            tone="success"
            icon={<CheckCircle2 size={14} strokeWidth={1.5} />}
          />
          <StatCard
            label="Open flags"
            value={counts!.open_flags}
            tone={flagCount > 0 ? 'warning' : 'default'}
            sub={flagCount > 0 ? 'Needs review' : undefined}
            icon={<AlertTriangle size={14} strokeWidth={1.5} />}
          />
        </section>

        {/* Recent sessions */}
        <section aria-labelledby="recent-heading">
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            marginBottom: 12,
          }}>
            <h2 id="recent-heading" style={{
              margin: 0,
              fontSize: 'var(--cap-text-sm)',
              fontWeight: 500,
              color: 'var(--cap-fg-2)',
              textTransform: 'uppercase',
              letterSpacing: '0.07em',
            }}>
              Recent sessions
            </h2>
            <a
              href="/sessions"
              style={{
                fontSize: 12,
                color: 'var(--cap-accent)',
                textDecoration: 'none',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                fontWeight: 500,
              }}
            >
              View all <ArrowRight size={11} strokeWidth={2} />
            </a>
          </div>

          <Card>
            {recent.length === 0 ? (
              <div style={{ padding: '40px 24px', textAlign: 'center' }}>
                <p style={{ margin: '0 0 4px', fontSize: 14, fontWeight: 500, color: 'var(--cap-fg-1)' }}>
                  No sessions yet
                </p>
                <p style={{ margin: '0 0 18px', fontSize: 13, color: 'var(--cap-fg-3)', lineHeight: 1.65 }}>
                  Create a session to generate an invite link for a candidate.
                </p>
                <a href="/dashboard/new" style={{ textDecoration: 'none' }}>
                  <Button variant="primary" size="sm">Create first session</Button>
                </a>
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr>
                    {['Candidate', 'Stage', 'Status', 'Created'].map((h) => (
                      <th key={h} scope="col" style={TH_STYLE}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {recent.map((s) => (
                    <tr key={s.id} className="cap-table-row">
                      <td style={{
                        padding: '11px 16px',
                        color: 'var(--cap-fg-1)',
                        maxWidth: 220,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}>
                        {s.email ?? <span style={{ color: 'var(--cap-fg-3)' }}>—</span>}
                      </td>
                      <td style={{
                        padding: '11px 16px',
                        fontFamily: 'var(--cap-font-mono)',
                        fontSize: 11,
                        color: 'var(--cap-fg-2)',
                      }}>
                        {s.stage}
                      </td>
                      <td style={{ padding: '11px 16px' }}>
                        <StatusBadge status={s.status} />
                      </td>
                      <td style={{
                        padding: '11px 16px',
                        fontFamily: 'var(--cap-font-mono)',
                        fontSize: 11,
                        color: 'var(--cap-fg-2)',
                        whiteSpace: 'nowrap',
                      }}>
                        {s.created_at.toISOString().slice(0, 10)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </section>
      </main>
    </div>
  );
}
