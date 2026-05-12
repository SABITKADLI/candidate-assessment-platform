import { Card, ProgressBar } from '@cap/ui';

export type ScoreRunView = {
  id: string;
  pass_no: number;
  grader_version: string;
  model: string;
  score: string | null;
  subscores: Record<string, number>;
  evidence: Array<{ kind?: string; value?: string; refers_to?: string }>;
  confidence: string | null;
  flags: string[];
  rationale?: string | null;
};

const SEVERE = new Set(['ai_generated_suspected', 'plagiarism_suspected', 'identity_mismatch']);

export function GraderFlagBadge({ flag }: { flag: string }) {
  const severe = SEVERE.has(flag);
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      padding: '3px 7px',
      borderRadius: 'var(--cap-radius-sm)',
      border: `1px solid ${severe ? 'var(--cap-danger)' : 'var(--cap-border)'}`,
      color: severe ? 'var(--cap-danger)' : 'var(--cap-fg-2)',
      background: severe ? 'var(--cap-danger-muted)' : 'var(--cap-surface-2)',
      fontFamily: 'var(--cap-font-mono)',
      fontSize: 10,
      fontWeight: 600,
    }}>
      {flag}
    </span>
  );
}

export function ScoreBreakdownCard({ run }: { run: ScoreRunView }) {
  return (
    <Card style={{ padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 12, color: 'var(--cap-fg-3)', fontFamily: 'var(--cap-font-mono)' }}>
            pass {run.pass_no} · {run.grader_version}
          </div>
          <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--cap-fg-1)', fontFamily: 'var(--cap-font-mono)' }}>
            {run.score == null ? '-' : Number(run.score).toFixed(1)}
          </div>
        </div>
        <div style={{ textAlign: 'right', fontSize: 11, color: 'var(--cap-fg-3)', fontFamily: 'var(--cap-font-mono)' }}>
          {run.model}<br />
          confidence {run.confidence == null ? '-' : Number(run.confidence).toFixed(2)}
        </div>
      </div>
      <div style={{ display: 'grid', gap: 10 }}>
        {Object.entries(run.subscores ?? {}).map(([key, value]) => (
          <ProgressBar key={key} value={Number(value)} label={key} detail={Number(value).toFixed(1)} />
        ))}
      </div>
      {run.flags?.length ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 14 }}>
          {run.flags.map((flag) => <GraderFlagBadge key={flag} flag={flag} />)}
        </div>
      ) : null}
      {run.rationale ? (
        <p style={{ margin: '14px 0 0', fontSize: 12, lineHeight: 1.55, color: 'var(--cap-fg-2)' }}>
          {run.rationale}
        </p>
      ) : null}
    </Card>
  );
}

export function EvidenceList({ runs }: { runs: ScoreRunView[] }) {
  const evidence = runs.flatMap((run) => (run.evidence ?? []).map((item) => ({ ...item, pass_no: run.pass_no })));
  if (!evidence.length) {
    return <p style={{ margin: 0, color: 'var(--cap-fg-3)', fontSize: 13 }}>No evidence captured for this stage.</p>;
  }
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {evidence.map((item, index) => (
        <div key={`${item.pass_no}-${index}`} style={{
          padding: '9px 11px',
          border: '1px solid var(--cap-border)',
          borderRadius: 'var(--cap-radius-md)',
          background: 'var(--cap-surface-2)',
          fontSize: 12,
          lineHeight: 1.55,
        }}>
          <span style={{ fontFamily: 'var(--cap-font-mono)', color: 'var(--cap-accent)' }}>
            pass {item.pass_no} · {item.kind ?? 'evidence'}
          </span>
          <span style={{ color: 'var(--cap-fg-2)' }}> {item.value ?? '-'}</span>
          {item.refers_to && (
            <span style={{ color: 'var(--cap-fg-3)', fontFamily: 'var(--cap-font-mono)' }}> · {item.refers_to}</span>
          )}
        </div>
      ))}
    </div>
  );
}
