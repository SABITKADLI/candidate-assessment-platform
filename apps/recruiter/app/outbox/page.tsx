import { redirect } from 'next/navigation';
import { auth0, auth0Configured } from '@/lib/auth0';
import { sql } from '@cap/db';
import { Sidebar, Card } from '@cap/ui';
import { CheckCircle2, Clock, XCircle, AlertCircle, Send } from 'lucide-react';
import { RetryButton } from './RetryButton';

export const dynamic = 'force-dynamic';

type OutboxRow = {
  id: string;
  session_id: string;
  ats: string;
  status: string;
  attempts: number;
  next_attempt_at: Date | null;
  last_error: string | null;
  delivered_at: Date | null;
  created_at: Date;
  email: string | null;
};

const STATUS_STYLE: Record<string, { icon: React.ReactNode; color: string; label: string }> = {
  pending:    { icon: <Clock       size={12} strokeWidth={2} />, color: 'var(--cap-fg-3)',    label: 'Pending'    },
  delivering: { icon: <Send        size={12} strokeWidth={2} />, color: 'var(--cap-accent)',  label: 'Delivering' },
  delivered:  { icon: <CheckCircle2 size={12} strokeWidth={2}/>, color: 'var(--cap-success)', label: 'Delivered'  },
  failed:     { icon: <AlertCircle size={12} strokeWidth={2} />, color: 'var(--cap-warning)', label: 'Failed'     },
  giveup:     { icon: <XCircle     size={12} strokeWidth={2} />, color: 'var(--cap-danger)',  label: 'Given up'   },
};

const TH_STYLE = {
  padding: '10px 14px', textAlign: 'left' as const,
  fontSize: '11px', fontWeight: 500, color: 'var(--cap-fg-2)',
  textTransform: 'uppercase' as const, letterSpacing: '0.07em',
  borderBottom: '1px solid var(--cap-border)', whiteSpace: 'nowrap' as const,
  background: 'var(--cap-surface)',
};

export default async function OutboxPage() {
  if (auth0Configured) {
    const session = await auth0.getSession();
    if (!session) redirect('/');
  }

  const rows = await sql<OutboxRow[]>`
    SELECT o.id, o.session_id, o.ats::text AS ats, o.status::text AS status,
           o.attempts, o.next_attempt_at, o.last_error, o.delivered_at, o.created_at,
           c.email
    FROM app.ats_outbox o
    JOIN app.sessions s ON s.id = o.session_id
    JOIN app.candidates c ON c.id = s.candidate_id
    ORDER BY o.created_at DESC
    LIMIT 200
  `;

  const pending   = rows.filter((r) => r.status === 'pending' || r.status === 'delivering').length;
  const delivered = rows.filter((r) => r.status === 'delivered').length;
  const failed    = rows.filter((r) => r.status === 'failed' || r.status === 'giveup').length;

  return (
    <div style={{ display: 'flex', minHeight: '100dvh' }}>
      <Sidebar activeId="outbox" />

      <main id="main-content" className="cap-main" style={{ flex: 1, padding: 'var(--cap-space-8)', minWidth: 0 }}>
        <header style={{ marginBottom: 'var(--cap-space-8)' }}>
          <h1 style={{ margin: '0 0 4px', fontSize: 'var(--cap-text-xl)', fontWeight: 600, letterSpacing: '-0.02em', lineHeight: 1.25, color: 'var(--cap-fg-1)' }}>
            ATS outbox
          </h1>
          <p style={{ margin: 0, fontSize: 'var(--cap-text-base)', color: 'var(--cap-fg-2)' }}>
            {rows.length === 0 ? 'No outbox entries' : (
              <>
                {pending > 0 && <><span style={{ color: 'var(--cap-accent)', fontWeight: 500 }}>{pending} pending</span> · </>}
                {delivered > 0 && <><span style={{ color: 'var(--cap-success)', fontWeight: 500 }}>{delivered} delivered</span> · </>}
                {failed > 0 && <><span style={{ color: 'var(--cap-danger)', fontWeight: 500 }}>{failed} failed</span></>}
                {failed === 0 && <>{delivered} delivered</>}
              </>
            )}
          </p>
        </header>

        {rows.length === 0 ? (
          <Card>
            <div style={{ padding: '64px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, textAlign: 'center' }}>
              <div style={{ width: 48, height: 48, background: 'var(--cap-surface-2)', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--cap-border)' }}>
                <Send size={20} strokeWidth={1.5} color="var(--cap-fg-3)" aria-hidden />
              </div>
              <div>
                <p style={{ margin: '0 0 4px', fontSize: 14, fontWeight: 500, color: 'var(--cap-fg-1)' }}>No outbox entries</p>
                <p style={{ margin: 0, fontSize: 13, color: 'var(--cap-fg-3)', lineHeight: 1.6 }}>
                  ATS webhook deliveries will appear here after sessions are scored.
                </p>
              </div>
            </div>
          </Card>
        ) : (
          <Card style={{ overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr>
                    {['Candidate', 'ATS', 'Status', 'Attempts', 'Last error', 'Timestamp', ''].map((h) => (
                      <th key={h} scope="col" style={TH_STYLE}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const style = STATUS_STYLE[row.status] ?? STATUS_STYLE.pending!;
                    const canRetry = row.status === 'failed' || row.status === 'giveup';
                    return (
                      <tr key={row.id} className="cap-table-row">
                        <td style={{ padding: '10px 14px', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          <a href={`/sessions/${row.session_id}`} style={{ color: 'var(--cap-accent)', textDecoration: 'none', fontWeight: 500, fontSize: 13 }}>
                            {row.email ?? row.session_id.slice(0, 8) + '…'}
                          </a>
                        </td>
                        <td style={{ padding: '10px 14px' }}>
                          <span style={{ fontFamily: 'var(--cap-font-mono)', fontSize: 11, color: 'var(--cap-fg-2)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                            {row.ats}
                          </span>
                        </td>
                        <td style={{ padding: '10px 14px' }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 500, color: style.color }}>
                            <span aria-hidden>{style.icon}</span>
                            {style.label}
                          </span>
                        </td>
                        <td style={{ padding: '10px 14px', fontFamily: 'var(--cap-font-mono)', fontSize: 11, color: 'var(--cap-fg-2)' }}>
                          {row.attempts}
                        </td>
                        <td style={{ padding: '10px 14px', fontFamily: 'var(--cap-font-mono)', fontSize: 11, color: 'var(--cap-danger)', maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {row.last_error ? row.last_error.slice(0, 80) : <span style={{ color: 'var(--cap-fg-3)' }}>—</span>}
                        </td>
                        <td style={{ padding: '10px 14px', fontFamily: 'var(--cap-font-mono)', fontSize: 11, color: 'var(--cap-fg-2)', whiteSpace: 'nowrap' }}>
                          {row.delivered_at
                            ? row.delivered_at.toISOString().slice(0, 16).replace('T', ' ')
                            : row.next_attempt_at
                              ? `next: ${row.next_attempt_at.toISOString().slice(0, 16).replace('T', ' ')}`
                              : row.created_at.toISOString().slice(0, 16).replace('T', ' ')}
                        </td>
                        <td style={{ padding: '10px 14px' }}>
                          {canRetry && <RetryButton id={row.id} />}
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
