import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { sql } from '@cap/db';
import { StageShell } from '@cap/ui';
import { AntibotBoot } from '@/lib/AntibotBoot';
import { IntegrityPlayer } from '@/lib/IntegrityPlayer';

export const dynamic = 'force-dynamic';

export default async function IntegrityPage() {
  const jar = await cookies();
  const sessionId = jar.get('cap_sess')?.value;
  if (!sessionId) redirect('/?reason=no_session');

  const rows = await sql<Array<{ stage: string; status: string }>>`
    SELECT stage::text AS stage, status::text AS status
    FROM app.sessions WHERE id = ${sessionId}::uuid LIMIT 1
  `;
  const session = rows[0];
  if (!session) redirect('/?reason=not_found');
  if (session.stage !== 'A') redirect('/?reason=wrong_stage');
  if (session.status === 'completed') redirect('/?reason=completed');

  return (
    <>
      <AntibotBoot stageKey="A_INTEGRITY" />
      <StageShell
        stageKey="A_INTEGRITY"
        title="Work values questionnaire"
        subtitle="32 statements about workplace attitudes. Indicate how much you agree or disagree with each — answer honestly."
      >
        <IntegrityPlayer />
      </StageShell>
    </>
  );
}
