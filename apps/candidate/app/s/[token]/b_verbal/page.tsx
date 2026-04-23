import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { sql } from '@cap/db';
import { StageShell } from '@cap/ui';
import { AntibotBoot } from '@/lib/AntibotBoot';
import { VerbalPlayer } from '@/lib/VerbalPlayer';

export const dynamic = 'force-dynamic';

export default async function BVerbalPage() {
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
      <AntibotBoot stageKey="B_VERBAL" />
      <StageShell
        stageKey="B_VERBAL"
        title="Verbal reasoning response"
        subtitle="Read the question, then record your spoken answer. Up to 2 minutes. Microphone only."
      >
        <VerbalPlayer />
      </StageShell>
    </>
  );
}
