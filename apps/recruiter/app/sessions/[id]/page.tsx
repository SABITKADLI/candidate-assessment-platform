import { redirect, notFound } from 'next/navigation';
import { auth0, auth0Configured } from '@/lib/auth0';
import { sql } from '@cap/db';
import { Sidebar, StatusBadge, FlagBadge, Card, ProgressBar } from '@cap/ui';
import { BackLink } from '@/lib/BackLink';
import { FlagActions } from '@/lib/FlagActions';
import { resolveFlagReason } from '@/lib/flagReasons';
import { RescoreButton } from '@/lib/RescoreButton';
import { getEmailLogForSession } from '@/lib/emailLog';
import type { SessionStatus, FlagSeverity } from '@cap/shared/enums';

export const dynamic = 'force-dynamic';

/* ── DB row types ──────────────────────────────────────────────────────── */
type SessionRow = {
  id: string;
  email: string | null;
  stage: string;
  status: SessionStatus;
  created_at: Date;
  expires_at: Date;
  started_at: Date | null;
  completed_at: Date | null;
};

type ScoreRow = {
  composite: string;
  per_stage: Record<string, number>;
  proctoring_mult: string;
  weights_version: number;
  memo_text: string | null;
  recommendation: string | null;
  computed_at: Date;
};

type AttemptRow = {
  stage_key: string;
  score: string | null;
  duration_s: number | null;
  started_at: Date | null;
  completed_at: Date | null;
};

type ArtifactRow = {
  id: string;
  stage_key: string | null;
  kind: string;
  s3_key: string;
  size_bytes: string;
  mime_type: string | null;
  created_at: Date;
};

type FlagRow = {
  id: string;
  severity: FlagSeverity;
  reason: string;
  stage_key: string | null;
  resolved: boolean;
  created_at: Date;
};

/* ── Display helpers ───────────────────────────────────────────────────── */
const STAGE_LABELS: Record<string, string> = {
  A_RESUME: 'Resume Upload', A_ID_LIVENESS: 'ID & Liveness', A_GMA: 'General Mental Ability',
  A_BIG5: 'Big Five', A_MBTI: 'MBTI', A_RORSCHACH: 'Rorschach',
  A_INTEGRITY: 'Integrity', A_SJT: 'Situational Judgment',
  B_CODING: 'Coding Challenge', B_DEBUG: 'Debug Challenge',
  B_WORK_SAMPLE: 'Work Sample', B_ASYNC_VIDEO: 'Async Video', B_VERBAL: 'Verbal Response',
};

const BUCKET_LABELS: Record<string, string> = {
  gma: 'General Mental Ability', coding: 'Coding', verbal: 'Verbal',
  work_sample: 'Work Sample', sjt: 'Situational Judgment',
  big5_mbti: 'Personality (Big5 + MBTI)', integrity: 'Integrity',
  rorschach: 'Rorschach', resume: 'Resume', id_liveness: 'ID & Liveness',
};

const RECO_STYLES: Record<string, { color: string; bg: string; border: string; label: string }> = {
  advance: { color: 'var(--cap-success)', bg: 'var(--cap-success-muted)', border: 'var(--cap-success-border)', label: '✓ Advance' },
  hold:    { color: 'var(--cap-warning)', bg: 'var(--cap-warning-muted)', border: 'var(--cap-warning-border)', label: '⏸ Hold for review' },
  decline: { color: 'var(--cap-danger)',  bg: 'var(--cap-danger-muted)',  border: 'var(--cap-danger-border)',  label: '✕ Decline' },
  unknown: { color: 'var(--cap-fg-3)',    bg: 'var(--cap-surface-2)',     border: 'var(--cap-border)',         label: '? Unknown' },
};

function fmtDuration(s: number | null): string {
  if (s == null) return '—';
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
}

function fmtBytes(n: string | number): string {
  const b = Number(n);
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

const TH: React.CSSProperties = {
  padding: '9px 14px', textAlign: 'left', fontSize: 11, fontWeight: 500,
  color: 'var(--cap-fg-2)', textTransform: 'uppercase', letterSpacing: '0.07em',
  borderBottom: '1px solid var(--cap-border)', whiteSpace: 'nowrap',
  background: 'var(--cap-surface)',
};
const TD: React.CSSProperties = {
  padding: '10px 14px', fontSize: 13, color: 'var(--cap-fg-1)', verticalAlign: 'middle',
};

/* ── Score panel ───────────────────────────────────────────────────────── */
function ScorePanel({ score }: { score: ScoreRow }) {
  const composite = Number(score.composite);
  const mult = Number(score.proctoring_mult);
  const reco = RECO_STYLES[score.recommendation ?? 'unknown'] ?? RECO_STYLES.unknown!;
  const tone = composite >= 75 ? 'var(--cap-success)' : composite >= 50 ? 'var(--cap-warning)' : 'var(--cap-danger)';

  const perStage = score.per_stage ?? {};
  const buckets = Object.entries(perStage).sort(([, a], [, b]) => b - a);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 16, alignItems: 'start' }}>
      {/* Composite */}
      <Card style={{ padding: '24px 28px', minWidth: 180, textAlign: 'center' }}>
        <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--cap-fg-3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10 }}>
          Composite score
        </div>
        <div style={{
          fontSize: 52, fontWeight: 700, color: tone,
          fontFamily: 'var(--cap-font-mono)', lineHeight: 1, letterSpacing: '-0.03em',
          marginBottom: 8,
        }}>
          {composite.toFixed(1)}
        </div>
        <div style={{ fontSize: 11, color: 'var(--cap-fg-3)', fontFamily: 'var(--cap-font-mono)', marginBottom: 14 }}>
          / 100
        </div>
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 5,
          padding: '4px 10px', borderRadius: 9999,
          fontSize: 11, fontWeight: 600, fontFamily: 'var(--cap-font-mono)',
          letterSpacing: '0.04em',
          background: reco.bg, color: reco.color, border: `1px solid ${reco.border}`,
        }}>
          {reco.label}
        </span>
        {mult < 1 && (
          <div style={{ marginTop: 10, fontSize: 11, color: 'var(--cap-warning)', fontFamily: 'var(--cap-font-mono)' }}>
            × {mult.toFixed(2)} flag penalty
          </div>
        )}
      </Card>

      {/* Per-stage bars */}
      <Card style={{ padding: '20px 20px' }}>
        <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--cap-fg-3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 14 }}>
          Stage breakdown
        </div>
        {buckets.length === 0 ? (
          <p style={{ margin: 0, fontSize: 13, color: 'var(--cap-fg-3)' }}>No stage scores recorded.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {buckets.map(([bucket, val]) => (
              <ProgressBar
                key={bucket}
                value={val}
                label={BUCKET_LABELS[bucket] ?? bucket}
                detail={val.toFixed(1)}
              />
            ))}
          </div>
        )}
        <div style={{ marginTop: 16, fontSize: 11, color: 'var(--cap-fg-3)', fontFamily: 'var(--cap-font-mono)' }}>
          weights v{score.weights_version} · scored {score.computed_at.toISOString().slice(0, 16).replace('T', ' ')}
        </div>
      </Card>
    </div>
  );
}

/* ── Page ──────────────────────────────────────────────────────────────── */
export default async function SessionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  if (auth0Configured) {
    const session = await auth0.getSession();
    if (!session) redirect('/');
  }

  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const [sessionRow] = await sql<SessionRow[]>`
    SELECT s.id, c.email,
           s.stage::text AS stage, s.status::text AS status,
           s.created_at, s.expires_at, s.started_at, s.completed_at
    FROM app.sessions s
    JOIN app.candidates c ON c.id = s.candidate_id
    WHERE s.id = ${id}::uuid
  `;
  if (!sessionRow) notFound();

  const [scoreRow] = await sql<ScoreRow[]>`
    SELECT composite::text, per_stage, proctoring_mult::text, weights_version,
           memo_text, recommendation, computed_at
    FROM app.scores
    WHERE session_id = ${id}::uuid
  `;

  const attempts = await sql<AttemptRow[]>`
    SELECT stage_key::text AS stage_key, score::text AS score,
           duration_s, started_at, completed_at
    FROM app.stage_attempts
    WHERE session_id = ${id}::uuid
    ORDER BY completed_at ASC NULLS LAST, stage_key
  `;

  const artifacts = await sql<ArtifactRow[]>`
    SELECT id, stage_key::text AS stage_key, kind::text AS kind,
           s3_key, size_bytes::text AS size_bytes, mime_type, created_at
    FROM app.artifacts
    WHERE session_id = ${id}::uuid
    ORDER BY created_at
  `;

  const flags = await sql<FlagRow[]>`
    SELECT id, severity::text AS severity, reason,
           stage_key::text AS stage_key, resolved, created_at
    FROM app.proctoring_flags
    WHERE session_id = ${id}::uuid
    ORDER BY resolved ASC, created_at DESC
  `;

  const emailLog = await getEmailLogForSession(id).catch(() => []);

  const displayName = sessionRow.email ?? id.slice(0, 8) + '…';

  return (
    <div style={{ display: 'flex', minHeight: '100dvh' }}>
      <Sidebar activeId="sessions" />

      <main id="main-content" className="cap-main" style={{ flex: 1, padding: 'var(--cap-space-8)', minWidth: 0 }}>
        <BackLink href="/sessions" label="Sessions" />

        {/* Page header */}
        <header style={{ marginBottom: 'var(--cap-space-8)', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
          <div>
            <h1 style={{ margin: '0 0 6px', fontSize: 'var(--cap-text-xl)', fontWeight: 600, letterSpacing: '-0.02em', lineHeight: 1.25, color: 'var(--cap-fg-1)' }}>
              {displayName}
            </h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <StatusBadge status={sessionRow.status} />
              <span style={{ fontSize: 11, fontFamily: 'var(--cap-font-mono)', color: 'var(--cap-fg-3)' }}>
                Stage {sessionRow.stage}
              </span>
              <span style={{ fontSize: 11, fontFamily: 'var(--cap-font-mono)', color: 'var(--cap-fg-3)' }}>
                Created {sessionRow.created_at.toISOString().slice(0, 16).replace('T', ' ')}
              </span>
              {sessionRow.completed_at && (
                <span style={{ fontSize: 11, fontFamily: 'var(--cap-font-mono)', color: 'var(--cap-success)' }}>
                  Completed {sessionRow.completed_at.toISOString().slice(0, 16).replace('T', ' ')}
                </span>
              )}
            </div>
          </div>
          <RescoreButton sessionId={sessionRow.id} />
        </header>

        {/* Score */}
        {scoreRow ? (
          <section aria-labelledby="score-heading" style={{ marginBottom: 'var(--cap-space-8)' }}>
            <h2 id="score-heading" style={{ margin: '0 0 12px', fontSize: 'var(--cap-text-sm)', fontWeight: 500, color: 'var(--cap-fg-2)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
              Assessment score
            </h2>
            <ScorePanel score={scoreRow} />
          </section>
        ) : (
          <Card style={{ marginBottom: 'var(--cap-space-8)', padding: '20px 24px' }}>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--cap-fg-3)' }}>
              Score not yet computed. It will appear here once the candidate completes the assessment and the scoring worker processes the results.
            </p>
          </Card>
        )}

        {/* Stage attempts */}
        {attempts.length > 0 && (
          <section aria-labelledby="attempts-heading" style={{ marginBottom: 'var(--cap-space-8)' }}>
            <h2 id="attempts-heading" style={{ margin: '0 0 12px', fontSize: 'var(--cap-text-sm)', fontWeight: 500, color: 'var(--cap-fg-2)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
              Stage attempts
            </h2>
            <Card style={{ overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr>
                    {['Stage', 'Score', 'Duration', 'Completed'].map((h) => (
                      <th key={h} scope="col" style={TH}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {attempts.map((a) => (
                    <tr key={a.stage_key} className="cap-table-row">
                      <td style={TD}>
                        <span style={{ fontFamily: 'var(--cap-font-mono)', fontSize: 11, color: 'var(--cap-fg-2)' }}>
                          {STAGE_LABELS[a.stage_key] ?? a.stage_key}
                        </span>
                      </td>
                      <td style={{ ...TD, fontFamily: 'var(--cap-font-mono)', fontWeight: 600, color: a.score ? 'var(--cap-fg-1)' : 'var(--cap-fg-3)' }}>
                        {a.score != null ? Number(a.score).toFixed(1) : '—'}
                      </td>
                      <td style={{ ...TD, fontFamily: 'var(--cap-font-mono)', fontSize: 11, color: 'var(--cap-fg-2)' }}>
                        {fmtDuration(a.duration_s)}
                      </td>
                      <td style={{ ...TD, fontFamily: 'var(--cap-font-mono)', fontSize: 11, color: 'var(--cap-fg-2)' }}>
                        {a.completed_at ? a.completed_at.toISOString().slice(0, 16).replace('T', ' ') : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          </section>
        )}

        {/* Proctoring flags */}
        {flags.length > 0 && (
          <section id="flags" aria-labelledby="flags-heading" style={{ marginBottom: 'var(--cap-space-8)' }}>
            <h2 id="flags-heading" style={{ margin: '0 0 12px', fontSize: 'var(--cap-text-sm)', fontWeight: 500, color: 'var(--cap-fg-2)', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'flex', alignItems: 'center', gap: 8 }}>
              Proctoring flags
              <span style={{ fontSize: 10, fontWeight: 600, fontFamily: 'var(--cap-font-mono)', color: 'var(--cap-fg-3)', background: 'var(--cap-surface-2)', padding: '1px 7px', borderRadius: 9999, border: '1px solid var(--cap-border)' }}>
                {flags.filter((f) => !f.resolved).length} open
              </span>
            </h2>
            <Card style={{ overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr>
                    {['Severity', 'Reason', 'Stage', 'Raised', 'Status', 'Actions'].map((h) => (
                      <th key={h} scope="col" style={TH}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {flags.map((f) => (
                    <tr
                      key={f.id}
                      id={`flag-${f.id}`}
                      className="cap-table-row cap-flag-row"
                      style={{ opacity: f.resolved ? 0.55 : 1, scrollMarginTop: 20 }}
                    >
                      <td style={TD}><FlagBadge severity={f.severity} /></td>
                      <td style={{ ...TD, maxWidth: 340 }}>
                        {(() => {
                          const info = resolveFlagReason(f.reason);
                          return (
                            <>
                              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--cap-fg-1)', marginBottom: 3 }}>
                                {info.label}
                              </div>
                              <div style={{ fontSize: 12, color: 'var(--cap-fg-2)', lineHeight: 1.55, marginBottom: 4 }}>
                                {info.description}
                              </div>
                              <div style={{ fontFamily: 'var(--cap-font-mono)', fontSize: 10, color: 'var(--cap-fg-3)' }}>
                                {f.reason}
                              </div>
                            </>
                          );
                        })()}
                      </td>
                      <td style={{ ...TD, fontFamily: 'var(--cap-font-mono)', fontSize: 11, color: 'var(--cap-fg-2)' }}>
                        {f.stage_key ? (STAGE_LABELS[f.stage_key] ?? f.stage_key) : '—'}
                      </td>
                      <td style={{ ...TD, fontFamily: 'var(--cap-font-mono)', fontSize: 11, color: 'var(--cap-fg-2)', whiteSpace: 'nowrap' }}>
                        {f.created_at.toISOString().slice(0, 16).replace('T', ' ')}
                      </td>
                      <td style={{ ...TD, fontSize: 11, color: f.resolved ? 'var(--cap-success)' : 'var(--cap-warning)', fontWeight: 500 }}>
                        {f.resolved ? 'Resolved' : 'Open'}
                      </td>
                      <td style={TD}>
                        <FlagActions id={f.id} resolved={f.resolved} severity={f.severity} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          </section>
        )}

        {/* Artifacts */}
        {artifacts.length > 0 && (
          <section aria-labelledby="artifacts-heading" style={{ marginBottom: 'var(--cap-space-8)' }}>
            <h2 id="artifacts-heading" style={{ margin: '0 0 12px', fontSize: 'var(--cap-text-sm)', fontWeight: 500, color: 'var(--cap-fg-2)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
              Artifacts
            </h2>
            <Card style={{ overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr>
                    {['Kind', 'Stage', 'Size', 'Type', 'Uploaded'].map((h) => (
                      <th key={h} scope="col" style={TH}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {artifacts.map((a) => (
                    <tr key={a.id} className="cap-table-row">
                      <td style={{ ...TD, fontFamily: 'var(--cap-font-mono)', fontSize: 11, color: 'var(--cap-accent)' }}>
                        {a.kind}
                      </td>
                      <td style={{ ...TD, fontFamily: 'var(--cap-font-mono)', fontSize: 11, color: 'var(--cap-fg-2)' }}>
                        {a.stage_key ?? '—'}
                      </td>
                      <td style={{ ...TD, fontFamily: 'var(--cap-font-mono)', fontSize: 11, color: 'var(--cap-fg-2)' }}>
                        {fmtBytes(a.size_bytes)}
                      </td>
                      <td style={{ ...TD, fontFamily: 'var(--cap-font-mono)', fontSize: 11, color: 'var(--cap-fg-2)' }}>
                        {a.mime_type ?? '—'}
                      </td>
                      <td style={{ ...TD, fontFamily: 'var(--cap-font-mono)', fontSize: 11, color: 'var(--cap-fg-2)', whiteSpace: 'nowrap' }}>
                        {a.created_at.toISOString().slice(0, 16).replace('T', ' ')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          </section>
        )}

        {/* Invite emails */}
        {emailLog.length > 0 && (
          <section aria-labelledby="email-heading" style={{ marginBottom: 'var(--cap-space-8)' }}>
            <h2 id="email-heading" style={{ margin: '0 0 12px', fontSize: 'var(--cap-text-sm)', fontWeight: 500, color: 'var(--cap-fg-2)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
              Invite emails
            </h2>
            <Card style={{ overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr>
                    {['To', 'Status', 'Engagement', 'Attempts', 'Resend ID', 'Error', 'Sent'].map((h) => (
                      <th key={h} scope="col" style={TH}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {emailLog.map((e) => {
                    const isFailed  = e.status === 'failed' || e.status === 'bounced' || e.status === 'complained';
                    const isOk      = e.status === 'delivered';
                    const statusColor = isOk
                      ? 'var(--cap-success)'
                      : isFailed
                      ? 'var(--cap-danger)'
                      : 'var(--cap-fg-2)';
                    return (
                      <tr key={e.id} className="cap-table-row">
                        <td style={{ ...TD, fontFamily: 'var(--cap-font-mono)', fontSize: 11 }}>{e.to_email}</td>
                        <td style={{ ...TD }}>
                          <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: 5,
                            fontSize: 11, fontWeight: 600, fontFamily: 'var(--cap-font-mono)',
                            color: statusColor,
                          }}>
                            {isFailed && <span aria-hidden>✕</span>}
                            {isOk     && <span aria-hidden>✓</span>}
                            {e.status}
                          </span>
                        </td>
                        <td style={{ ...TD }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            {e.opened_at ? (
                              <span style={{
                                display: 'inline-flex', alignItems: 'center', gap: 4,
                                fontSize: 10, fontWeight: 500, fontFamily: 'var(--cap-font-mono)',
                                color: 'var(--cap-accent)',
                                background: 'var(--cap-accent-surface)',
                                border: '1px solid var(--cap-accent)',
                                borderRadius: 4, padding: '1px 6px',
                              }}
                                title={`Opened ${e.opened_at.toISOString().slice(0, 16).replace('T', ' ')}`}
                              >
                                👁 opened · {e.opened_at.toISOString().slice(11, 16)}
                              </span>
                            ) : null}
                            {e.clicked_at ? (
                              <span style={{
                                display: 'inline-flex', alignItems: 'center', gap: 4,
                                fontSize: 10, fontWeight: 500, fontFamily: 'var(--cap-font-mono)',
                                color: 'var(--cap-success)',
                                background: 'var(--cap-success-muted)',
                                border: '1px solid var(--cap-success-border)',
                                borderRadius: 4, padding: '1px 6px',
                              }}
                                title={`Clicked ${e.clicked_at.toISOString().slice(0, 16).replace('T', ' ')}`}
                              >
                                ↗ clicked · {e.clicked_at.toISOString().slice(11, 16)}
                              </span>
                            ) : null}
                            {!e.opened_at && !e.clicked_at && (
                              <span style={{ fontSize: 11, color: 'var(--cap-fg-3)', fontFamily: 'var(--cap-font-mono)' }}>—</span>
                            )}
                          </div>
                        </td>
                        <td style={{ ...TD, fontFamily: 'var(--cap-font-mono)', fontSize: 11, color: 'var(--cap-fg-3)' }}>
                          {e.attempts}
                        </td>
                        <td style={{ ...TD, fontFamily: 'var(--cap-font-mono)', fontSize: 11, color: 'var(--cap-fg-3)', maxWidth: 220, wordBreak: 'break-all' }}>
                          {e.resend_id ?? '—'}
                        </td>
                        <td style={{ ...TD, fontFamily: 'var(--cap-font-mono)', fontSize: 11, color: 'var(--cap-danger)', maxWidth: 260 }}>
                          {e.last_error ?? '—'}
                        </td>
                        <td style={{ ...TD, fontFamily: 'var(--cap-font-mono)', fontSize: 11, color: 'var(--cap-fg-3)', whiteSpace: 'nowrap' }}>
                          {e.created_at.toISOString().slice(0, 16).replace('T', ' ')}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Card>
          </section>
        )}

        {/* Memo */}
        <section aria-labelledby="memo-heading">
          <h2 id="memo-heading" style={{ margin: '0 0 12px', fontSize: 'var(--cap-text-sm)', fontWeight: 500, color: 'var(--cap-fg-2)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
            Assessment memo
          </h2>
          {scoreRow?.memo_text ? (
            <Card style={{ padding: '20px 24px' }}>
              <pre style={{
                margin: 0,
                fontFamily: 'var(--cap-font-sans)',
                fontSize: 13,
                color: 'var(--cap-fg-1)',
                lineHeight: 1.75,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}>
                {scoreRow.memo_text}
              </pre>
            </Card>
          ) : (
            <Card style={{ padding: '20px 24px' }}>
              <p style={{ margin: 0, fontSize: 13, color: 'var(--cap-fg-3)' }}>
                {scoreRow
                  ? 'Memo not yet generated. Set ANTHROPIC_API_KEY to enable Claude-powered candidate memos.'
                  : 'No memo — session not yet scored.'}
              </p>
            </Card>
          )}
        </section>
      </main>
    </div>
  );
}
