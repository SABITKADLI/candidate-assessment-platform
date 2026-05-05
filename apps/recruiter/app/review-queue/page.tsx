import { requireRecruiterSession } from '@/lib/requireAuth';
import { sql } from '@cap/db';
import { Sidebar, Card } from '@cap/ui';
import { GraderFlagBadge } from '@/lib/grading-ui';

export const dynamic = 'force-dynamic';

type SearchParams = Promise<{ reason?: string }>;

const TABS = [
  { label: 'Severe flags', reason: 'severe_flag' },
  { label: 'Divergence', reason: 'divergence' },
  { label: 'Low confidence', reason: 'low_confidence' },
];

export default async function ReviewQueuePage({ searchParams }: { searchParams: SearchParams }) {
  await requireRecruiterSession();
  const { reason } = await searchParams;

  const rows = await sql<Array<{
    stage_attempt_id: string;
    reconciled_score: string;
    divergence: string | null;
    review_reason: string | null;
    updated_at: Date;
    stage_key: string;
    session_id: string;
    candidate_email: string | null;
    role_name: string | null;
    flags: string[];
  }>>`
    SELECT rec.stage_attempt_id,
           rec.reconciled_score::text AS reconciled_score,
           rec.divergence::text AS divergence,
           rec.review_reason,
           rec.updated_at,
           a.stage_key::text AS stage_key,
           s.id AS session_id,
           c.email AS candidate_email,
           r.name AS role_name,
           coalesce((
             SELECT array_agg(DISTINCT flag)
             FROM app.score_runs sr
             CROSS JOIN unnest(sr.flags) AS flag
             WHERE sr.stage_attempt_id = a.id
           ), '{}'::text[]) AS flags
    FROM app.score_reconciliations rec
    JOIN app.stage_attempts a ON a.id = rec.stage_attempt_id
    JOIN app.sessions s ON s.id = a.session_id
    JOIN app.candidates c ON c.id = s.candidate_id
    LEFT JOIN app.roles r ON r.id = s.role_id
    WHERE rec.needs_review = true
      AND (${reason ?? null}::text IS NULL OR rec.review_reason = ${reason ?? null})
    ORDER BY rec.updated_at DESC
    LIMIT 200
  `;

  return (
    <div style={{ display: 'flex', minHeight: '100dvh' }}>
      <Sidebar activeId="review" />
      <main id="main-content" className="cap-main" style={{ flex: 1, padding: 'var(--cap-space-8)', minWidth: 0 }}>
        <header style={{ marginBottom: 'var(--cap-space-8)' }}>
          <h1 style={{ margin: 0, fontSize: 'var(--cap-text-xl)' }}>Review queue</h1>
          <p style={{ margin: '5px 0 0', color: 'var(--cap-fg-2)' }}>{rows.length} attempts need human review</p>
        </header>
        <nav style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          {TABS.map((tab) => (
            <a
              key={tab.reason}
              href={`/review-queue?reason=${tab.reason}`}
              style={{
                padding: '6px 10px',
                borderRadius: 'var(--cap-radius-md)',
                border: '1px solid var(--cap-border)',
                color: reason === tab.reason ? 'var(--cap-accent)' : 'var(--cap-fg-2)',
                background: reason === tab.reason ? 'var(--cap-accent-surface)' : 'var(--cap-surface)',
                textDecoration: 'none',
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              {tab.label}
            </a>
          ))}
          <a href="/review-queue" style={{ color: 'var(--cap-fg-3)', fontSize: 12, padding: '6px 10px' }}>All</a>
        </nav>
        <Card style={{ overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                {['Candidate', 'Role', 'Stage', 'Reason', 'Score', 'Flags', 'Updated'].map((heading) => (
                  <th key={heading} style={TH}>{heading}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.stage_attempt_id} className="cap-table-row">
                  <td style={TD}><a href={`/sessions/${row.session_id}/grading`} style={{ color: 'var(--cap-accent)' }}>{row.candidate_email ?? row.session_id.slice(0, 8)}</a></td>
                  <td style={TD}>{row.role_name ?? '-'}</td>
                  <td style={{ ...TD, fontFamily: 'var(--cap-font-mono)' }}>{row.stage_key}</td>
                  <td style={TD}>{row.review_reason ?? '-'}</td>
                  <td style={{ ...TD, fontFamily: 'var(--cap-font-mono)' }}>{Number(row.reconciled_score).toFixed(1)} / Δ {row.divergence ?? '0'}</td>
                  <td style={TD}><div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>{row.flags.map((flag) => <GraderFlagBadge key={flag} flag={flag} />)}</div></td>
                  <td style={{ ...TD, fontFamily: 'var(--cap-font-mono)', color: 'var(--cap-fg-3)' }}>{row.updated_at.toISOString().slice(0, 16).replace('T', ' ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </main>
    </div>
  );
}

const TH: React.CSSProperties = {
  padding: '10px 14px',
  textAlign: 'left',
  fontSize: 11,
  color: 'var(--cap-fg-2)',
  textTransform: 'uppercase',
  letterSpacing: '0.07em',
  borderBottom: '1px solid var(--cap-border)',
};
const TD: React.CSSProperties = { padding: '11px 14px', verticalAlign: 'middle' };
