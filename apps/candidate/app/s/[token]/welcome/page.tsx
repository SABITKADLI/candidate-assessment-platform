import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { sql } from '@cap/db';
import { StageShell, StatusBadge, Button } from '@cap/ui';
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

  return (
    <StageShell
      stageKey={`STAGE ${s.stage}`}
      title="Welcome"
      subtitle="Next stage does not have a UI in this MVP."
      footer={<Button variant="primary" disabled>Begin stage (coming soon)</Button>}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: 'var(--cap-fg-2)' }}>
        <StatusBadge status={s.status} />
        <span style={{ fontFamily: 'var(--cap-font-mono)', fontSize: 11 }}>
          Expires {s.expires_at.toISOString().replace('T',' ').slice(0,19)}Z
        </span>
      </div>
    </StageShell>
  );
}
