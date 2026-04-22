import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { sql } from '@cap/db';
import { StageShell } from '@cap/ui';
import { AntibotBoot } from '@/lib/AntibotBoot';
import { RorschachPlayer } from '@/lib/RorschachPlayer';

export const dynamic = 'force-dynamic';

export default async function RorschachPage() {
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
      <AntibotBoot stageKey="A_RORSCHACH" />
      <StageShell
        stageKey="A_RORSCHACH"
        title="Projective task"
        subtitle="You will be shown 10 images, one at a time. For each, describe what you see. Take your time — there are no right or wrong answers."
      >
        <RorschachPlayer />
      </StageShell>
    </>
  );
}
