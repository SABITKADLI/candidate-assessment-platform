import { requireRecruiterSession } from '@/lib/requireAuth';
import { sql } from '@cap/db';
import { Sidebar, Card, ProgressBar } from '@cap/ui';

export const dynamic = 'force-dynamic';

type CalibrationRow = {
  stage_key: string;
  grader_version: string;
  model: string;
  sample_size: number;
  mae: string | null;
  flagged_count: number;
  last_run_at: Date | null;
};

export default async function CalibrationPage() {
  await requireRecruiterSession();
  const rowsRaw = await sql<CalibrationRow[]>`
    SELECT cs.stage_key::text AS stage_key,
           cr.grader_version,
           cr.model,
           count(*)::int AS sample_size,
           avg(cr.abs_error)::numeric(6,3)::text AS mae,
           count(*) FILTER (WHERE cr.flagged)::int AS flagged_count,
           max(cr.ran_at) AS last_run_at
    FROM app.calibration_runs cr
    JOIN app.calibration_set cs ON cs.id = cr.fixture_id
    WHERE cr.ran_at >= now() - interval '30 days'
    GROUP BY cs.stage_key, cr.grader_version, cr.model
    ORDER BY cs.stage_key, cr.grader_version
  `;
  const rows: CalibrationRow[] = [...rowsRaw];

  const byStage = new Map<string, CalibrationRow[]>();
  for (const row of rows) {
    const list = byStage.get(row.stage_key) ?? [];
    list.push(row);
    byStage.set(row.stage_key, list);
  }

  return (
    <div style={{ display: 'flex', minHeight: '100dvh' }}>
      <Sidebar activeId="calibration" />
      <main id="main-content" className="cap-main" style={{ flex: 1, padding: 'var(--cap-space-8)', minWidth: 0 }}>
        <header style={{ marginBottom: 'var(--cap-space-8)', display: 'flex', justifyContent: 'space-between', gap: 16 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 'var(--cap-text-xl)' }}>Calibration</h1>
            <p style={{ margin: '5px 0 0', color: 'var(--cap-fg-2)' }}>Drift, MAE, and grader-version distributions</p>
          </div>
          <form action="/api/calibration/run" method="post">
            <button className="cap-btn cap-btn-secondary cap-btn-md" type="submit">Re-run now</button>
          </form>
        </header>

        <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14, marginBottom: 20 }}>
          {Array.from(byStage.entries()).map(([stage, stageRows]) => {
            const sampleSize = stageRows.reduce((sum, row) => sum + row.sample_size, 0);
            const maeValues = stageRows.map((row) => Number(row.mae ?? 0));
            const mae = maeValues.length ? maeValues.reduce((sum, value) => sum + value, 0) / maeValues.length : 0;
            return (
              <Card key={stage} style={{ padding: 16 }}>
                <div style={{ fontFamily: 'var(--cap-font-mono)', color: 'var(--cap-accent)', fontSize: 12, marginBottom: 8 }}>{stage}</div>
                <div style={{ fontSize: 30, fontWeight: 700, fontFamily: 'var(--cap-font-mono)' }}>{mae.toFixed(2)}</div>
                <div style={{ color: 'var(--cap-fg-3)', fontSize: 12, marginBottom: 12 }}>MAE · {sampleSize} samples</div>
                <ProgressBar value={Math.max(0, 100 - mae * 10)} label="calibration health" detail={`${stageRows.reduce((sum, row) => sum + row.flagged_count, 0)} flagged`} />
              </Card>
            );
          })}
        </section>

        <Card style={{ overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                {['Stage', 'Version', 'Model', 'N', 'MAE', 'Flagged', 'Last run'].map((heading) => <th key={heading} style={TH}>{heading}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={`${row.stage_key}-${row.grader_version}`} className="cap-table-row">
                  <td style={TD}>{row.stage_key}</td>
                  <td style={TD}>{row.grader_version}</td>
                  <td style={TD}>{row.model}</td>
                  <td style={TD}>{row.sample_size}</td>
                  <td style={TD}>{row.mae ?? '-'}</td>
                  <td style={TD}>{row.flagged_count}</td>
                  <td style={TD}>{row.last_run_at ? row.last_run_at.toISOString().slice(0, 16).replace('T', ' ') : '-'}</td>
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
const TD: React.CSSProperties = { padding: '11px 14px', fontFamily: 'var(--cap-font-mono)' };
