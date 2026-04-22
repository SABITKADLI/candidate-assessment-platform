import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { sql } from '@cap/db';
import { StageShell } from '@cap/ui';
import { AntibotBoot } from '@/lib/AntibotBoot';
import { CodingPlayer } from '@/lib/CodingPlayer';

export const dynamic = 'force-dynamic';

export default async function BCodingPage() {
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
      <AntibotBoot stageKey="B_CODING" />
      <StageShell
        stageKey="B_CODING"
        title="Coding challenge"
        subtitle="Solve the problem below in Python. Your solution will be run against hidden test cases after submission."
      >
        <CodingPlayer />
      </StageShell>
    </>
  );
}
