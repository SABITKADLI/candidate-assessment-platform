import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { sql } from '@cap/db';
import { StageShell } from '@cap/ui';
import { AntibotBoot } from '@/lib/AntibotBoot';
import { DebugPlayer } from '@/lib/DebugPlayer';

export const dynamic = 'force-dynamic';

export default async function BDebugPage() {
  const jar = await cookies();
  const sessionId = jar.get('cap_sess')?.value;
  if (!sessionId) redirect('/?reason=no_session');

  const rows = await sql<Array<{ stage: string; status: string }>>`
    SELECT stage::text AS stage, status::text AS status
    FROM app.sessions WHERE id = ${sessionId}::uuid LIMIT 1
  `;
  const session = rows[0];
  if (!session) redirect('/?reason=not_found');
  if (session.stage !== 'B') redirect('/?reason=wrong_stage');
  if (session.status === 'completed') redirect('/?reason=completed');

  return (
    <>
      <AntibotBoot stageKey="B_DEBUG" />
      <StageShell
        stageKey="B_DEBUG"
        title="Debug challenge"
        subtitle="The code below has two bugs. Find and fix them — do not rewrite the function from scratch."
      >
        <DebugPlayer />
      </StageShell>
    </>
  );
}
