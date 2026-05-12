import { notFound } from 'next/navigation';
import { requireRecruiterSession } from '@/lib/requireAuth';
import { sql } from '@cap/db';
import { Sidebar, Card, ProgressBar } from '@cap/ui';
import { BackLink } from '@/lib/BackLink';
import { OverrideForm } from '@/lib/OverrideForm';
import { EvidenceList, GraderFlagBadge, ScoreBreakdownCard, type ScoreRunView } from '@/lib/grading-ui';

export const dynamic = 'force-dynamic';

type AttemptRow = {
  id: string;
  stage_key: string;
  score: string | null;
  scoring_status: string;
  scoring_error: string | null;
  completed_at: Date | null;
};

type ReconciliationRow = {
  stage_attempt_id: string;
  reconciled_score: string;
  divergence: string | null;
  needs_review: boolean;
  review_reason: string | null;
  override_score: string | null;
  override_reason: string | null;
  reviewed_at: Date | null;
};

const STATUS_COLOR: Record<string, string> = {
  final: 'var(--cap-success)',
  review: 'var(--cap-warning)',
  grading: 'var(--cap-accent)',
  queued: 'var(--cap-info)',
  failed: 'var(--cap-danger)',
  pending: 'var(--cap-fg-3)',
};

export default async function SessionGradingPage({ params }: { params: Promise<{ id: string }> }) {
  await requireRecruiterSession();
  const { id } = await params;

  const [session] = await sql<Array<{
    id: string;
    candidate_email: string | null;
    role_name: string | null;
    composite: string | null;
    proctoring_mult: string | null;
  }>>`
    SELECT s.id,
           c.email AS candidate_email,
           r.name AS role_name,
           sc.composite::text AS composite,
           sc.proctoring_mult::text AS proctoring_mult
    FROM app.sessions s
    JOIN app.candidates c ON c.id = s.candidate_id
    LEFT JOIN app.roles r ON r.id = s.role_id
    LEFT JOIN app.scores sc ON sc.session_id = s.id
    WHERE s.id = ${id}::uuid
  `;
  if (!session) notFound();

  const attempts = await sql<AttemptRow[]>`
    SELECT id, stage_key::text AS stage_key, score::text AS score,
           scoring_status, scoring_error, completed_at
    FROM app.stage_attempts
    WHERE session_id = ${id}::uuid
    ORDER BY completed_at ASC NULLS LAST, stage_key
  `;
  const recs = await sql<ReconciliationRow[]>`
    SELECT stage_attempt_id, reconciled_score::text AS reconciled_score,
           divergence::text AS divergence, needs_review, review_reason,
           override_score::text AS override_score, override_reason, reviewed_at
    FROM app.score_reconciliations
    WHERE stage_attempt_id = ANY(${attempts.map((attempt) => attempt.id)}::uuid[])
  `;
  const runs = attempts.length
    ? await sql<ScoreRunView[]>`
        SELECT id, stage_attempt_id, grader_version, model, pass_no,
               score::text AS score, subscores, evidence, confidence::text AS confidence,
               flags, rationale
        FROM app.score_runs
        WHERE stage_attempt_id = ANY(${attempts.map((attempt) => attempt.id)}::uuid[])
        ORDER BY stage_attempt_id, pass_no, created_at DESC
      `
    : [];

  const recByAttempt = new Map(recs.map((rec) => [rec.stage_attempt_id, rec]));
  const runsByAttempt = new Map<string, ScoreRunView[]>();
  for (const run of runs) {
    const attemptId = (run as ScoreRunView & { stage_attempt_id?: string }).stage_attempt_id;
    if (!attemptId) continue;
    const list = runsByAttempt.get(attemptId) ?? [];
    list.push(run);
    runsByAttempt.set(attemptId, list);
  }

  return (
    <div style={{ display: 'flex', minHeight: '100dvh' }}>
      <Sidebar activeId="sessions" />
      <main id="main-content" className="cap-main" style={{ flex: 1, padding: 'var(--cap-space-8)', minWidth: 0 }}>
        <BackLink href={`/sessions/${id}`} label="Session" />
        <header style={{ marginBottom: 'var(--cap-space-8)', display: 'flex', justifyContent: 'space-between', gap: 16 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 'var(--cap-text-xl)', color: 'var(--cap-fg-1)' }}>
              Grading
            </h1>
            <p style={{ margin: '5px 0 0', color: 'var(--cap-fg-2)' }}>
              {session.candidate_email ?? id.slice(0, 8)} · {session.role_name ?? 'No role'}
            </p>
          </div>
          <Card style={{ padding: '12px 16px', minWidth: 170 }}>
            <div style={{ fontSize: 11, color: 'var(--cap-fg-3)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
              Composite
            </div>
            <div style={{ fontFamily: 'var(--cap-font-mono)', fontSize: 24, fontWeight: 700 }}>
              {session.composite == null ? '-' : Number(session.composite).toFixed(1)}
            </div>
            <div style={{ fontSize: 11, color: 'var(--cap-fg-3)', fontFamily: 'var(--cap-font-mono)' }}>
              proctoring × {session.proctoring_mult == null ? '1.000' : Number(session.proctoring_mult).toFixed(3)}
            </div>
          </Card>
        </header>

        <section style={{ display: 'grid', gap: 14, marginBottom: 'var(--cap-space-8)' }}>
          {attempts.map((attempt) => {
            const rec = recByAttempt.get(attempt.id);
            const flagList = Array.from(new Set((runsByAttempt.get(attempt.id) ?? []).flatMap((run) => run.flags ?? [])));
            return (
              <Card key={attempt.id} style={{ padding: 16 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 16, alignItems: 'start' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
                      <h2 style={{ margin: 0, fontSize: 'var(--cap-text-md)', color: 'var(--cap-fg-1)' }}>{attempt.stage_key}</h2>
                      <span style={{
                        color: STATUS_COLOR[attempt.scoring_status] ?? 'var(--cap-fg-2)',
                        fontFamily: 'var(--cap-font-mono)',
                        fontSize: 11,
                        fontWeight: 700,
                      }}>
                        {attempt.scoring_status}
                      </span>
                      {rec?.needs_review && <GraderFlagBadge flag={rec.review_reason ?? 'review'} />}
                      {flagList.map((flag) => <GraderFlagBadge key={flag} flag={flag} />)}
                    </div>
                    <ProgressBar
                      value={Number(rec?.override_score ?? rec?.reconciled_score ?? attempt.score ?? 0)}
                      label="reconciled score"
                      detail={rec ? `${Number(rec.override_score ?? rec.reconciled_score).toFixed(1)} · divergence ${rec.divergence ?? '0'}` : 'not reconciled'}
                    />
                    {attempt.scoring_error && (
                      <p style={{ margin: '10px 0 0', color: 'var(--cap-danger)', fontSize: 12 }}>{attempt.scoring_error}</p>
                    )}
                  </div>
                  <a
                    href={`/api/grading/${attempt.id}`}
                    style={{ color: 'var(--cap-accent)', fontSize: 12, fontFamily: 'var(--cap-font-mono)' }}
                  >
                    JSON
                  </a>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14, marginTop: 16 }}>
                  {(runsByAttempt.get(attempt.id) ?? []).slice(0, 2).map((run) => (
                    <ScoreBreakdownCard key={run.id} run={run} />
                  ))}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(260px, 360px)', gap: 16, marginTop: 16 }}>
                  <Card style={{ padding: 16, background: 'var(--cap-surface-2)' }}>
                    <h3 style={{ margin: '0 0 10px', fontSize: 13 }}>Evidence</h3>
                    <EvidenceList runs={runsByAttempt.get(attempt.id) ?? []} />
                  </Card>
                  <Card style={{ padding: 16, background: 'var(--cap-surface-2)' }}>
                    <h3 style={{ margin: '0 0 10px', fontSize: 13 }}>Manual override</h3>
                    <OverrideForm
                      attemptId={attempt.id}
                      currentScore={Number(rec?.override_score ?? rec?.reconciled_score ?? attempt.score ?? 0)}
                    />
                    {rec?.override_reason && (
                      <p style={{ margin: '10px 0 0', fontSize: 12, color: 'var(--cap-fg-3)' }}>
                        Last override: {rec.override_reason}
                      </p>
                    )}
                  </Card>
                </div>
              </Card>
            );
          })}
        </section>
      </main>
    </div>
  );
}
