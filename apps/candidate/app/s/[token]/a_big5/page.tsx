import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { sql } from '@cap/db';
import { StageShell } from '@cap/ui';
import { AntibotBoot } from '@/lib/AntibotBoot';
import { Big5Player } from '@/lib/Big5Player';

export const dynamic = 'force-dynamic';

export default async function Big5Page() {
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
      <AntibotBoot stageKey="A_BIG5" />
      <StageShell
        stageKey="A_BIG5"
        title="Personality questionnaire"
        subtitle="120 statements. Indicate how accurately each statement describes you. There are no right or wrong answers — answer honestly."
      >
        <Big5Player />
      </StageShell>
    </>
  );
}
