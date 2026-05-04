import { notFound } from 'next/navigation';
import { requireRecruiterSession } from '@/lib/requireAuth';
import { sql } from '@cap/db';
import { Sidebar, StatusBadge, FlagBadge, Card, ProgressBar } from '@cap/ui';
import { BackLink } from '@/lib/BackLink';
import { FlagActions } from '@/lib/FlagActions';
import { resolveFlagReason } from '@/lib/flagReasons';
import { RescoreButton } from '@/lib/RescoreButton';
import { getEmailLogForSession } from '@/lib/emailLog';
import { ResendEmailButton } from '@/lib/ResendEmailButton';
import { presignGet } from '@/lib/s3';
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
  raw_payload: Record<string, unknown> | null;
};

type ArtifactRow = {
  id: string;
  stage_key: string | null;
  kind: string;
  s3_key: string;
  size_bytes: string;
  mime_type: string | null;
  created_at: Date;
  presigned_url: string | null;
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

/* ── Artifact media card ───────────────────────────────────────────────── */
function ArtifactCard({ artifact }: { artifact: ArtifactRow }) {
  const label = artifact.stage_key ? (STAGE_LABELS[artifact.stage_key] ?? artifact.stage_key) : artifact.kind;
  const downloadHref = `/api/artifacts/${artifact.id}/download`;
  const url = artifact.presigned_url;

  return (
    <Card style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--cap-fg-1)' }}>{label}</div>
          <div style={{ fontSize: 11, color: 'var(--cap-fg-3)', fontFamily: 'var(--cap-font-mono)', marginTop: 2 }}>
            {artifact.kind} · {fmtBytes(artifact.size_bytes)} · {artifact.mime_type ?? '—'}
          </div>
        </div>
        <a
          href={downloadHref}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            padding: '5px 12px', borderRadius: 'var(--cap-radius-sm)',
            fontSize: 12, fontWeight: 500,
            color: 'var(--cap-accent)',
            background: 'var(--cap-accent-surface)',
            border: '1px solid var(--cap-accent)',
            textDecoration: 'none', whiteSpace: 'nowrap', flexShrink: 0,
          }}
        >
          ↓ Download
        </a>
      </div>

      {/* Inline player */}
      {artifact.kind === 'video' && url && (
        <video
          src={url}
          controls
          style={{ width: '100%', borderRadius: 'var(--cap-radius-md)', background: '#000', maxHeight: 400 }}
        />
      )}
      {artifact.kind === 'audio' && url && (
        <audio
          src={url}
          controls
          style={{ width: '100%' }}
        />
      )}
      {artifact.kind === 'resume' && url && (
        <iframe
          src={url}
          title="Resume preview"
          style={{ width: '100%', height: 500, border: '1px solid var(--cap-border)', borderRadius: 'var(--cap-radius-md)' }}
        />
      )}

      <div style={{ fontSize: 11, color: 'var(--cap-fg-3)', fontFamily: 'var(--cap-font-mono)' }}>
        Uploaded {artifact.created_at.toISOString().slice(0, 16).replace('T', ' ')}
      </div>
    </Card>
  );
}

/* ── Per-stage answer blocks ───────────────────────────────────────────── */
function StageAnswerBlock({ attempt }: { attempt: AttemptRow }) {
  const p = attempt.raw_payload;
  if (!p) return null;

  switch (attempt.stage_key) {
    case 'B_WORK_SAMPLE': {
      const text = typeof p.text === 'string' ? p.text : null;
      const wc = typeof p.word_count === 'number' ? p.word_count : null;
      if (!text) return null;
      return (
        <Card style={{ padding: '18px 20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--cap-fg-1)' }}>Work Sample</span>
            {wc != null && (
              <span style={{ fontSize: 11, fontFamily: 'var(--cap-font-mono)', color: 'var(--cap-fg-3)' }}>
                {wc} words
              </span>
            )}
          </div>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--cap-fg-1)', lineHeight: 1.75, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            {text}
          </p>
        </Card>
      );
    }

    case 'A_RORSCHACH': {
      const responses = p.responses as Record<string, string> | undefined;
      const metrics = p.response_metrics as Array<{ id: string; chars: number; words: number }> | undefined;
      if (!responses) return null;
      return (
        <Card style={{ padding: '18px 20px' }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--cap-fg-1)', marginBottom: 14 }}>Rorschach Responses</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {Object.entries(responses).map(([id, text]) => {
              const m = metrics?.find((x) => x.id === id);
              return (
                <div key={id} style={{ padding: '10px 14px', background: 'var(--cap-surface-2)', borderRadius: 'var(--cap-radius-sm)', border: '1px solid var(--cap-border)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ fontSize: 11, fontWeight: 600, fontFamily: 'var(--cap-font-mono)', color: 'var(--cap-accent)' }}>{id}</span>
                    {m && <span style={{ fontSize: 11, fontFamily: 'var(--cap-font-mono)', color: 'var(--cap-fg-3)' }}>{m.words}w / {m.chars}c</span>}
                  </div>
                  <p style={{ margin: 0, fontSize: 13, color: 'var(--cap-fg-1)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{text}</p>
                </div>
              );
            })}
          </div>
        </Card>
      );
    }

    case 'A_SJT': {
      const items = p.items as Array<{ id: string; situation: string; chosen_key: string | null; chosen_text: string | null; item_score: number | null; isAttentionCheck?: boolean }> | undefined;
      if (!items?.length) return null;
      return (
        <Card style={{ overflow: 'hidden' }}>
          <div style={{ padding: '14px 16px', fontSize: 13, fontWeight: 600, color: 'var(--cap-fg-1)', borderBottom: '1px solid var(--cap-border)' }}>
            Situational Judgment — Answers
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                {['#', 'Situation (truncated)', 'Chosen', 'Score'].map((h) => (
                  <th key={h} scope="col" style={TH}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((item, i) => (
                <tr key={item.id} className="cap-table-row">
                  <td style={{ ...TD, fontFamily: 'var(--cap-font-mono)', fontSize: 11, color: 'var(--cap-fg-3)' }}>{i + 1}</td>
                  <td style={{ ...TD, maxWidth: 300, color: 'var(--cap-fg-2)', fontSize: 12 }}>
                    {item.situation.slice(0, 120)}{item.situation.length > 120 ? '…' : ''}
                  </td>
                  <td style={{ ...TD, fontSize: 12 }}>{item.chosen_text ?? '—'}</td>
                  <td style={{ ...TD, fontFamily: 'var(--cap-font-mono)', fontWeight: 600, color: item.item_score != null ? 'var(--cap-fg-1)' : 'var(--cap-fg-3)' }}>
                    {item.item_score != null ? item.item_score : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      );
    }

    case 'A_BIG5': {
      const scores = p.scores as Record<string, number> | undefined;
      const type = p.type as string | undefined;
      const failures = p.attention_check_failures as unknown[] | undefined;
      if (!scores) return null;
      return (
        <Card style={{ padding: '18px 20px' }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--cap-fg-1)', marginBottom: 14 }}>Big Five — Factor Scores</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {Object.entries(scores).map(([factor, val]) => (
              <ProgressBar key={factor} value={Number(val)} label={factor.charAt(0).toUpperCase() + factor.slice(1)} detail={Number(val).toFixed(1)} />
            ))}
          </div>
          {failures && failures.length > 0 && (
            <div style={{ marginTop: 12, fontSize: 11, color: 'var(--cap-warning)', fontFamily: 'var(--cap-font-mono)' }}>
              {failures.length} attention check failure{failures.length > 1 ? 's' : ''}
            </div>
          )}
          {type && <div style={{ marginTop: 8, fontSize: 11, color: 'var(--cap-fg-3)', fontFamily: 'var(--cap-font-mono)' }}>type: {type}</div>}
        </Card>
      );
    }

    case 'A_MBTI': {
      const type = p.type as string | undefined;
      const clarityScore = p.clarity_score as number | undefined;
      const scores = p.scores as Record<string, { a: number; b: number }> | undefined;
      if (!type && !scores) return null;
      return (
        <Card style={{ padding: '18px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--cap-fg-1)' }}>MBTI</div>
            {type && <span style={{ fontSize: 20, fontWeight: 700, fontFamily: 'var(--cap-font-mono)', color: 'var(--cap-accent)' }}>{type}</span>}
            {clarityScore != null && <span style={{ fontSize: 12, color: 'var(--cap-fg-3)', fontFamily: 'var(--cap-font-mono)' }}>clarity {clarityScore.toFixed(1)}</span>}
          </div>
          {scores && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {Object.entries(scores).map(([dim, { a, b }]) => {
                const total = a + b || 1;
                const pctA = Math.round((a / total) * 100);
                return (
                  <div key={dim} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ width: 32, fontSize: 11, fontFamily: 'var(--cap-font-mono)', color: 'var(--cap-fg-2)', flexShrink: 0 }}>{dim}</span>
                    <div style={{ flex: 1, height: 8, background: 'var(--cap-surface-2)', borderRadius: 9999, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${pctA}%`, background: 'var(--cap-accent)', borderRadius: 9999 }} />
                    </div>
                    <span style={{ fontSize: 11, fontFamily: 'var(--cap-font-mono)', color: 'var(--cap-fg-3)', width: 36, textAlign: 'right' }}>{pctA}%</span>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      );
    }

    case 'A_INTEGRITY': {
      const score = attempt.score != null ? Number(attempt.score) : null;
      if (score == null) return null;
      const tone = score >= 70 ? 'var(--cap-success)' : score >= 45 ? 'var(--cap-warning)' : 'var(--cap-danger)';
      return (
        <Card style={{ padding: '18px 20px' }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--cap-fg-1)', marginBottom: 10 }}>Integrity</div>
          <div style={{ fontSize: 28, fontWeight: 700, fontFamily: 'var(--cap-font-mono)', color: tone }}>{score.toFixed(1)}<span style={{ fontSize: 13, color: 'var(--cap-fg-3)' }}> / 100</span></div>
        </Card>
      );
    }

    case 'B_CODING':
    case 'B_DEBUG': {
      const results = p.test_results as Array<{ name: string; passed: boolean; output?: string }> | undefined;
      const passed = typeof p.tests_passed === 'number' ? p.tests_passed : null;
      const total = typeof p.tests_total === 'number' ? p.tests_total : null;
      if (!results && passed == null) return null;
      return (
        <Card style={{ overflow: 'hidden' }}>
          <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--cap-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--cap-fg-1)' }}>
              {STAGE_LABELS[attempt.stage_key] ?? attempt.stage_key} — Test Results
            </span>
            {passed != null && total != null && (
              <span style={{ fontSize: 12, fontFamily: 'var(--cap-font-mono)', color: passed === total ? 'var(--cap-success)' : 'var(--cap-warning)' }}>
                {passed}/{total} passed
              </span>
            )}
          </div>
          {results && (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <tbody>
                {results.map((r, i) => (
                  <tr key={i} className="cap-table-row">
                    <td style={{ ...TD, width: 20, paddingRight: 6 }}>
                      <span style={{ color: r.passed ? 'var(--cap-success)' : 'var(--cap-danger)' }}>{r.passed ? '✓' : '✕'}</span>
                    </td>
                    <td style={{ ...TD, fontFamily: 'var(--cap-font-mono)', fontSize: 12 }}>{r.name}</td>
                    {r.output && (
                      <td style={{ ...TD, fontSize: 11, color: 'var(--cap-fg-3)', fontFamily: 'var(--cap-font-mono)', maxWidth: 300, wordBreak: 'break-all' }}>
                        {r.output.slice(0, 200)}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      );
    }

    default:
      return null;
  }
}

/* ── Page ──────────────────────────────────────────────────────────────── */
export default async function SessionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireRecruiterSession();

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
           duration_s, started_at, completed_at, raw_payload
    FROM app.stage_attempts
    WHERE session_id = ${id}::uuid
    ORDER BY completed_at ASC NULLS LAST, stage_key
  `;

  const rawArtifacts = await sql<Omit<ArtifactRow, 'presigned_url'>[]>`
    SELECT id, stage_key::text AS stage_key, kind::text AS kind,
           s3_key, size_bytes::text AS size_bytes, mime_type, created_at
    FROM app.artifacts
    WHERE session_id = ${id}::uuid
    ORDER BY created_at
  `;

  // Generate presigned URLs for media artifacts (valid 1hr)
  const artifacts: ArtifactRow[] = await Promise.all(
    rawArtifacts.map(async (a) => {
      const needsUrl = a.kind === 'video' || a.kind === 'audio' || a.kind === 'resume';
      const presigned_url = needsUrl ? await presignGet(a.s3_key).catch(() => null) : null;
      return { ...a, presigned_url };
    }),
  );

  const flags = await sql<FlagRow[]>`
    SELECT id, severity::text AS severity, reason,
           stage_key::text AS stage_key, resolved, created_at
    FROM app.proctoring_flags
    WHERE session_id = ${id}::uuid
    ORDER BY resolved ASC, created_at DESC
  `;

  const emailLog = await getEmailLogForSession(id).catch(() => []);

  const displayName = sessionRow.email ?? id.slice(0, 8) + '…';

  // Separate media artifacts from other artifacts
  const mediaArtifacts = artifacts.filter((a) => ['video', 'audio', 'resume'].includes(a.kind));
  const otherArtifacts = artifacts.filter((a) => !['video', 'audio', 'resume'].includes(a.kind));

  // Stage answers to display (skip pure-presence stages)
  const answerStages = ['B_WORK_SAMPLE', 'A_RORSCHACH', 'A_SJT', 'A_BIG5', 'A_MBTI', 'A_INTEGRITY', 'B_CODING', 'B_DEBUG'];
  const answerAttempts = attempts.filter((a) => answerStages.includes(a.stage_key) && a.raw_payload);

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

        {/* Media artifacts — video, audio, resume */}
        {mediaArtifacts.length > 0 && (
          <section aria-labelledby="media-heading" style={{ marginBottom: 'var(--cap-space-8)' }}>
            <h2 id="media-heading" style={{ margin: '0 0 12px', fontSize: 'var(--cap-text-sm)', fontWeight: 500, color: 'var(--cap-fg-2)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
              Submissions
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {mediaArtifacts.map((a) => <ArtifactCard key={a.id} artifact={a} />)}
            </div>
          </section>
        )}

        {/* Stage answers */}
        {answerAttempts.length > 0 && (
          <section aria-labelledby="answers-heading" style={{ marginBottom: 'var(--cap-space-8)' }}>
            <h2 id="answers-heading" style={{ margin: '0 0 12px', fontSize: 'var(--cap-text-sm)', fontWeight: 500, color: 'var(--cap-fg-2)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
              Stage answers
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {answerAttempts.map((a) => <StageAnswerBlock key={a.stage_key} attempt={a} />)}
            </div>
          </section>
        )}

        {/* Stage attempts table */}
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

        {/* Other artifacts (liveness, etc.) */}
        {otherArtifacts.length > 0 && (
          <section aria-labelledby="artifacts-heading" style={{ marginBottom: 'var(--cap-space-8)' }}>
            <h2 id="artifacts-heading" style={{ margin: '0 0 12px', fontSize: 'var(--cap-text-sm)', fontWeight: 500, color: 'var(--cap-fg-2)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
              Other artifacts
            </h2>
            <Card style={{ overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr>
                    {['Kind', 'Stage', 'Size', 'Type', 'Uploaded', ''].map((h) => (
                      <th key={h} scope="col" style={TH}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {otherArtifacts.map((a) => (
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
                      <td style={TD}>
                        <a
                          href={`/api/artifacts/${a.id}/download`}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ fontSize: 12, color: 'var(--cap-accent)', textDecoration: 'none' }}
                        >
                          ↓ Download
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          </section>
        )}

        {/* Invite emails */}
        {(emailLog.length > 0 || sessionRow.email) && (
          <section aria-labelledby="email-heading" style={{ marginBottom: 'var(--cap-space-8)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <h2 id="email-heading" style={{ margin: 0, fontSize: 'var(--cap-text-sm)', fontWeight: 500, color: 'var(--cap-fg-2)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                Invite emails
              </h2>
              <ResendEmailButton sessionId={sessionRow.id} />
            </div>
            <Card style={{ overflow: 'hidden' }}>
              {emailLog.length === 0 ? (
                <p style={{ margin: 0, padding: '16px 20px', fontSize: 13, color: 'var(--cap-fg-3)' }}>
                  No emails sent yet. Use the button above to send the invite.
                </p>
              ) : (
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
              )}
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
