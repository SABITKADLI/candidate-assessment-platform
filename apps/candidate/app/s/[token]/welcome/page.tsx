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
      title="All done for now"
      subtitle="You've completed all sections for this stage. The recruiter will be in touch with next steps."
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, fontSize: 13, color: 'var(--cap-fg-2)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <StatusBadge status={s.status} />
          <span>{stageLabel} · session active</span>
        </div>
        <p style={{ margin: 0, lineHeight: 1.6 }}>
          You may close this window. No further action is required from you at this time.
        </p>
      </div>
    </StageShell>
  );
}
