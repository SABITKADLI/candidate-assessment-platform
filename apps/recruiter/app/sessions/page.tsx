import { redirect } from 'next/navigation';
import { auth0, auth0Configured } from '@/lib/auth0';
import { sql } from '@cap/db';
import { Sidebar, StatusBadge, Button } from '@cap/ui';
import type { SessionStatus, StageGroup } from '@cap/shared/enums';

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
      <main style={{ flex: 1, padding: 'var(--cap-space-8)', minWidth: 0 }}>
        <header style={{ marginBottom: 'var(--cap-space-8)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 600 }}>Sessions</h1>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--cap-fg-2)' }}>
              {sessions.length} session{sessions.length !== 1 ? 's' : ''}
            </p>
          </div>
          <a href="/dashboard/new" style={{ textDecoration: 'none' }}>
            <Button variant="primary">+ New session</Button>
          </a>
        </header>

        {sessions.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--cap-fg-3)' }}>No sessions yet. Create one to get started.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--cap-border)' }}>
                  {['Candidate', 'Stage', 'Status', 'Created', 'Expires', 'Link'].map((h) => (
                    <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: 'var(--cap-fg-3)', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sessions.map((s) => {
                  const expired = s.expires_at < now;
                  return (
                    <tr key={s.id} style={{ borderBottom: '1px solid var(--cap-border)' }}>
                      <td style={{ padding: '10px 12px', color: 'var(--cap-fg-1)' }}>
                        {s.email ?? <span style={{ color: 'var(--cap-fg-3)' }}>—</span>}
                      </td>
                      <td style={{ padding: '10px 12px', fontFamily: 'var(--cap-font-mono)', fontSize: 12, color: 'var(--cap-fg-2)' }}>
                        Stage {s.stage}
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        <StatusBadge status={s.status} />
                      </td>
                      <td style={{ padding: '10px 12px', color: 'var(--cap-fg-2)', whiteSpace: 'nowrap', fontFamily: 'var(--cap-font-mono)', fontSize: 11 }}>
                        {s.created_at.toISOString().slice(0, 16).replace('T', ' ')}
                      </td>
                      <td style={{ padding: '10px 12px', whiteSpace: 'nowrap', fontFamily: 'var(--cap-font-mono)', fontSize: 11, color: expired ? 'var(--cap-danger)' : 'var(--cap-fg-2)' }}>
                        {s.expires_at.toISOString().slice(0, 16).replace('T', ' ')}
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        {!expired && (
                          <a
                            href={`${base}/s/${s.resume_token}`}
                            target="_blank"
                            rel="noreferrer"
                            style={{ fontSize: 12, color: 'var(--cap-accent)', textDecoration: 'none' }}
                          >
                            Open ↗
                          </a>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
