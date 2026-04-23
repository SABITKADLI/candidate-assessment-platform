import { redirect } from 'next/navigation';
import { auth0, auth0Configured } from '@/lib/auth0';
import { sql } from '@cap/db';
import { Sidebar, FlagBadge } from '@cap/ui';
import type { FlagSeverity } from '@cap/shared/enums';

export const dynamic = 'force-dynamic';

type FlagRow = {
  id: string;
  severity: FlagSeverity;
  reason: string;
  resolved: boolean;
  created_at: Date;
  email: string | null;
  session_id: string;
  stage_key: string | null;
};

export default async function FlagsPage() {
  if (auth0Configured) {
    const session = await auth0.getSession();
    if (!session) redirect('/');
  }

  const flags = await sql<FlagRow[]>`
    SELECT f.id, f.severity::text AS severity, f.reason, f.resolved,
           f.created_at, f.stage_key::text AS stage_key,
           s.id AS session_id, c.email
    FROM app.proctoring_flags f
    JOIN app.sessions s ON s.id = f.session_id
    JOIN app.candidates c ON c.id = s.candidate_id
    ORDER BY f.resolved ASC, f.created_at DESC
    LIMIT 200
  `;

  const open = flags.filter((f) => !f.resolved);
  const resolved = flags.filter((f) => f.resolved);

  return (
    <div style={{ display: 'flex', minHeight: '100dvh' }}>
      <Sidebar activeId="flags" />
      <main style={{ flex: 1, padding: 'var(--cap-space-8)', minWidth: 0 }}>
        <header style={{ marginBottom: 'var(--cap-space-8)' }}>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 600 }}>Proctoring Flags</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--cap-fg-2)' }}>
            {open.length} open · {resolved.length} resolved
          </p>
        </header>

        {flags.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--cap-fg-3)' }}>No proctoring flags raised.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--cap-border)' }}>
                  {['Severity', 'Reason', 'Stage', 'Candidate', 'Raised', 'Status'].map((h) => (
                    <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: 'var(--cap-fg-3)', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {flags.map((f) => (
                  <tr key={f.id} style={{ borderBottom: '1px solid var(--cap-border)', opacity: f.resolved ? 0.5 : 1 }}>
                    <td style={{ padding: '10px 12px' }}>
                      <FlagBadge severity={f.severity} />
                    </td>
                    <td style={{ padding: '10px 12px', fontFamily: 'var(--cap-font-mono)', fontSize: 11, color: 'var(--cap-fg-1)' }}>
                      {f.reason}
                    </td>
                    <td style={{ padding: '10px 12px', fontFamily: 'var(--cap-font-mono)', fontSize: 11, color: 'var(--cap-fg-2)' }}>
                      {f.stage_key ?? '—'}
                    </td>
                    <td style={{ padding: '10px 12px', color: 'var(--cap-fg-2)' }}>
                      {f.email ?? '—'}
                    </td>
                    <td style={{ padding: '10px 12px', whiteSpace: 'nowrap', fontFamily: 'var(--cap-font-mono)', fontSize: 11, color: 'var(--cap-fg-2)' }}>
                      {f.created_at.toISOString().slice(0, 16).replace('T', ' ')}
                    </td>
                    <td style={{ padding: '10px 12px', fontSize: 11, color: f.resolved ? 'var(--cap-success)' : 'var(--cap-warning)', fontFamily: 'var(--cap-font-mono)', textTransform: 'uppercase', fontWeight: 600 }}>
                      {f.resolved ? 'Resolved' : 'Open'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
