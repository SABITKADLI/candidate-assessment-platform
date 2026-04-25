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

  const rows = await sql<Array<{ stage: StageGroup; status: SessionStatus; expires_at: Date }>>`
    SELECT stage, status, expires_at FROM app.sessions WHERE id = ${sessionId}::uuid LIMIT 1
  `;
  const s = rows[0];
  if (!s) redirect('/?reason=not_found');

  const stageLabel = s.stage === 'A' ? 'Screening stage' : 'Technical stage';

  return (
    <StageShell
      stageKey={`STAGE_${s.stage}`}
      title="You're all done"
      subtitle="You've completed all sections for this stage. Thank you for your time — the recruiter will be in touch with next steps."
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* Status row */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '14px 16px',
          background: 'var(--cap-surface-2)',
          borderRadius: 'var(--cap-radius-md)',
          border: '1px solid var(--cap-border)',
        }}>
          <StatusBadge status={s.status} />
          <span style={{ fontSize: 13, color: 'var(--cap-fg-2)' }}>
            {stageLabel} · session active
          </span>
        </div>

        {/* Message */}
        <div style={{
          display: 'flex',
          gap: 14,
          padding: '16px',
          background: 'var(--cap-accent-surface)',
          borderRadius: 'var(--cap-radius-md)',
          border: '1px solid var(--cap-info-border)',
        }}>
          <svg
            width="18" height="18" viewBox="0 0 24 24" fill="none"
            stroke="var(--cap-accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            style={{ flexShrink: 0, marginTop: 1 }}
            aria-hidden
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" x2="12" y1="8" y2="12" />
            <line x1="12" x2="12.01" y1="16" y2="16" />
          </svg>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--cap-fg-2)', lineHeight: 1.65 }}>
            You may close this window. No further action is required from you at this time.
          </p>
        </div>
      </div>
    </StageShell>
  );
}
