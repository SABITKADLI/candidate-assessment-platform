import { redirect } from 'next/navigation';
import { auth0, auth0Configured } from '@/lib/auth0';
import { sql } from '@cap/db';
import { Sidebar, StatusBadge, Button, Card } from '@cap/ui';
import type { SessionStatus, StageGroup } from '@cap/shared/enums';
import { ExternalLink, Plus } from 'lucide-react';

export const dynamic = 'force-dynamic';

type SessionRow = {
  id: string;
  email: string | null;
  stage: StageGroup;
  status: SessionStatus;
  resume_token: string;
  created_at: Date;
  expires_at: Date;
};

function EmptyState() {
  return (
    <div style={{
      padding: '64px 24px',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 16,
      textAlign: 'center',
    }}>
      <svg width="56" height="56" viewBox="0 0 56 56" fill="none" aria-hidden>
        <rect width="56" height="56" rx="12" fill="var(--cap-surface-2)" />
        <rect x="14" y="16" width="28" height="3" rx="1.5" fill="var(--cap-border-2)" />
        <rect x="14" y="23" width="20" height="2.5" rx="1.25" fill="var(--cap-border)" />
        <rect x="14" y="29" width="24" height="2.5" rx="1.25" fill="var(--cap-border)" />
        <rect x="14" y="35" width="16" height="2.5" rx="1.25" fill="var(--cap-border)" />
        <circle cx="42" cy="38" r="8" fill="var(--cap-accent)" />
        <path d="M39 38h6M42 35v6" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
      <div>
        <p style={{ margin: '0 0 4px', fontSize: 14, fontWeight: 500, color: 'var(--cap-fg-1)' }}>
          No sessions yet
        </p>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--cap-fg-3)', lineHeight: 1.6 }}>
          Create a session to generate an assessment invite link for a candidate.
        </p>
      </div>
      <a href="/dashboard/new" style={{ textDecoration: 'none' }}>
        <Button variant="primary" size="sm">
          <Plus size={14} strokeWidth={2} aria-hidden />
          New session
        </Button>
      </a>
    </div>
  );
}

const TH_STYLE = {
  padding: '10px 14px',
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

export default async function SessionsPage() {
  if (auth0Configured) {
    const session = await auth0.getSession();
    if (!session) redirect('/');
  }

  const sessions = await sql<SessionRow[]>`
    SELECT s.id, c.email, s.stage::text AS stage, s.status::text AS status,
           s.resume_token, s.created_at, s.expires_at
    FROM app.sessions s
    JOIN app.candidates c ON c.id = s.candidate_id
    ORDER BY s.created_at DESC
    LIMIT 100
  `;

  const base = process.env.NEXT_PUBLIC_CANDIDATE_BASE_URL ?? 'http://localhost:3000';
  const now = new Date();

  return (
    <div style={{ display: 'flex', minHeight: '100dvh' }}>
      <Sidebar activeId="sessions" />

      <main id="main-content" className="cap-main" style={{ flex: 1, padding: 'var(--cap-space-8)', minWidth: 0 }}>
        <header style={{
          marginBottom: 'var(--cap-space-8)',
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 16,
        }}>
          <div>
            <h1 style={{
              margin: '0 0 4px',
              fontSize: 'var(--cap-text-xl)',
              fontWeight: 600,
              letterSpacing: '-0.02em',
              lineHeight: 1.25,
              color: 'var(--cap-fg-1)',
            }}>
              Sessions
            </h1>
            <p style={{ margin: 0, fontSize: 'var(--cap-text-base)', color: 'var(--cap-fg-2)' }}>
              {sessions.length === 0
                ? 'No sessions created yet'
                : `${sessions.length} session${sessions.length !== 1 ? 's' : ''} total`}
            </p>
          </div>
          <a href="/dashboard/new" style={{ textDecoration: 'none', flexShrink: 0 }}>
            <Button variant="primary" size="lg">
              <Plus size={15} strokeWidth={2} aria-hidden />
              New session
            </Button>
          </a>
        </header>

        {sessions.length === 0 ? (
          <Card>
            <EmptyState />
          </Card>
        ) : (
          <Card style={{ overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr>
                    {['Candidate', 'Stage', 'Status', 'Created'].map((h) => (
                      <th key={h} scope="col" style={TH_STYLE}>{h}</th>
                    ))}
                    <th scope="col" style={TH_STYLE} className="cap-table-hide-mobile">Expires</th>
                    <th scope="col" style={TH_STYLE}>Link</th>
                  </tr>
                </thead>
                <tbody>
                  {sessions.map((s) => {
                    const expired = s.expires_at < now;
                    return (
                      <tr key={s.id} className="cap-table-row">
                        <td style={{
                          padding: '11px 14px',
                          color: 'var(--cap-fg-1)',
                          maxWidth: 200,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}>
                          {s.email ?? <span style={{ color: 'var(--cap-fg-3)' }}>—</span>}
                        </td>
                        <td style={{
                          padding: '11px 14px',
                          fontFamily: 'var(--cap-font-mono)',
                          fontSize: 11,
                          color: 'var(--cap-fg-2)',
                        }}>
                          {s.stage}
                        </td>
                        <td style={{ padding: '11px 14px' }}>
                          <StatusBadge status={s.status} />
                        </td>
                        <td style={{
                          padding: '11px 14px',
                          fontFamily: 'var(--cap-font-mono)',
                          fontSize: 11,
                          color: 'var(--cap-fg-2)',
                          whiteSpace: 'nowrap',
                        }}>
                          {s.created_at.toISOString().slice(0, 16).replace('T', ' ')}
                        </td>
                        <td className="cap-table-hide-mobile" style={{
                          padding: '11px 14px',
                          fontFamily: 'var(--cap-font-mono)',
                          fontSize: 11,
                          whiteSpace: 'nowrap',
                          color: expired ? 'var(--cap-danger)' : 'var(--cap-fg-2)',
                          fontWeight: expired ? 500 : 400,
                        }}>
                          {s.expires_at.toISOString().slice(0, 16).replace('T', ' ')}
                        </td>
                        <td style={{ padding: '11px 14px' }}>
                          {!expired ? (
                            <a
                              href={`${base}/s/${s.resume_token}`}
                              target="_blank"
                              rel="noreferrer"
                              aria-label={`Open session for ${s.email ?? 'candidate'}`}
                              style={{
                                display: 'inline-flex', alignItems: 'center', gap: 4,
                                fontSize: 12, color: 'var(--cap-accent)', textDecoration: 'none',
                                fontWeight: 500,
                              }}
                            >
                              Open
                              <ExternalLink size={11} strokeWidth={2} aria-hidden />
                            </a>
                          ) : (
                            <span style={{ fontSize: 11, color: 'var(--cap-fg-3)', fontFamily: 'var(--cap-font-mono)' }}>—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </main>
    </div>
  );
}
