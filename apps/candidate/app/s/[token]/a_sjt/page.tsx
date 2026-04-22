import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { sql } from '@cap/db';
import { StageShell } from '@cap/ui';
import { AntibotBoot } from '@/lib/AntibotBoot';
import { SjtPlayer } from '@/lib/SjtPlayer';

export const dynamic = 'force-dynamic';

export default async function SjtPage() {
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
      <AntibotBoot stageKey="A_SJT" />
      <StageShell
        stageKey="A_SJT"
        title="Situational judgement"
        subtitle="10 workplace scenarios. For each, choose the response you would be most likely to take. There is no time limit."
      >
        <SjtPlayer />
      </StageShell>
    </>
  );
}
