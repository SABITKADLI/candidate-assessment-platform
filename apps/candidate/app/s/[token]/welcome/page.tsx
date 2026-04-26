import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { sql } from '@cap/db';
import { StageShell, StatusBadge } from '@cap/ui';
import type { SessionStatus, StageGroup } from '@cap/shared/enums';

export const dynamic = 'force-dynamic';

export default async function Welcome() {
  const jar = await cookies();
  const sessionId = jar.get('cap_sess')?.value;
  if (!sessionId) redirect('/?reason=no_session');

  const rows = await sql<Array<{ stage: StageGroup; status: SessionStatus; expires_at: Date; candidate_id: string }>>`
    SELECT stage, status, expires_at, candidate_id::text
    FROM app.sessions WHERE id = ${sessionId}::uuid LIMIT 1
  `;
  const s = rows[0];
  if (!s) redirect('/?reason=not_found');

  const stageLabel = s.stage === 'A' ? 'Screening stage' : 'Technical stage';

  // If this is Stage A, check if a pending Stage B session exists for the same candidate.
  let nextToken: string | null = null;
  if (s.stage === 'A') {
    const nextRows = await sql<Array<{ resume_token: string }>>`
      SELECT resume_token FROM app.sessions
      WHERE candidate_id = ${s.candidate_id}::uuid
        AND stage = 'B'::app.stage_group
        AND status IN ('pending', 'in_progress')
        AND expires_at > now()
      ORDER BY created_at ASC
      LIMIT 1
    `;
    nextToken = nextRows[0]?.resume_token ?? null;
  }

  return (
    <StageShell
      stageKey={`STAGE_${s.stage}`}
      title="You're all done"
      subtitle={
        nextToken
          ? "You've completed the screening stage. Continue to the technical assessment when you're ready."
          : "You've completed all sections for this stage. Thank you for your time — the recruiter will be in touch with next steps."
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* Status row */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '14px 16px',
          background: 'var(--cap-surface-2)',
          borderRadius: 'var(--cap-radius-md)',
          border: '1px solid var(--cap-border)',
        }}>
          <StatusBadge status={s.status} />
          <span style={{ fontSize: 13, color: 'var(--cap-fg-2)' }}>
            {stageLabel} · completed
          </span>
        </div>

        {/* Continue to Stage B */}
        {nextToken ? (
          <div style={{
            display: 'flex', flexDirection: 'column', gap: 12,
            padding: '18px 18px',
            background: 'var(--cap-accent-surface)',
            borderRadius: 'var(--cap-radius-md)',
            border: '1px solid var(--cap-info-border)',
          }}>
            <div style={{ display: 'flex', gap: 12 }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
                stroke="var(--cap-accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                style={{ flexShrink: 0, marginTop: 1 }} aria-hidden>
                <circle cx="12" cy="12" r="10" />
                <path d="M12 8v4l3 3" />
              </svg>
              <p style={{ margin: 0, fontSize: 13, color: 'var(--cap-fg-1)', lineHeight: 1.65, fontWeight: 500 }}>
                Technical assessment ready
              </p>
            </div>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--cap-fg-2)', lineHeight: 1.65, paddingLeft: 30 }}>
              Your recruiter has prepared a technical assessment for you. Start it when you&apos;re in a quiet place with at least 90 minutes available.
            </p>
            <div style={{ paddingLeft: 30 }}>
              <a
                href={`/s/${nextToken}`}
                className="cap-cta-link"
              >
                Continue to Technical Assessment
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              </a>
            </div>
          </div>
        ) : (
          <div style={{
            display: 'flex', gap: 14, padding: '16px',
            background: 'var(--cap-accent-surface)',
            borderRadius: 'var(--cap-radius-md)',
            border: '1px solid var(--cap-info-border)',
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
              stroke="var(--cap-accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
              style={{ flexShrink: 0, marginTop: 1 }} aria-hidden>
              <circle cx="12" cy="12" r="10" />
              <line x1="12" x2="12" y1="8" y2="12" />
              <line x1="12" x2="12.01" y1="16" y2="16" />
            </svg>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--cap-fg-2)', lineHeight: 1.65 }}>
              You may close this window. No further action is required from you at this time.
            </p>
          </div>
        )}
      </div>
    </StageShell>
  );
}
