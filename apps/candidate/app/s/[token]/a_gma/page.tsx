import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { sql } from '@cap/db';
import { StageShell } from '@cap/ui';
import { GmaPlayer } from '@/lib/GmaPlayer';
import { AntibotBoot } from '@/lib/AntibotBoot';

export const dynamic = 'force-dynamic';

export default async function GmaPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const jar = await cookies();
  const sessionId = jar.get('cap_sess')?.value;
  if (!sessionId) redirect('/?reason=no_session');

  const rows = await sql<Array<{ stage: 'A' | 'B'; status: string }>>`
    SELECT stage::text AS stage, status::text AS status
    FROM app.sessions WHERE id = ${sessionId}::uuid LIMIT 1
  `;
  const session = rows[0];
  if (!session) redirect('/?reason=not_found');
  if (session.stage !== 'A') redirect('/?reason=wrong_stage');
  if (session.status === 'completed') redirect('/?reason=completed');

  return (
    <>
      <AntibotBoot stageKey="A_GMA" />
      <StageShell
        stageKey="A_GMA"
        title="General mental ability"
        subtitle="10 questions. 12 minutes. Answer in order; you cannot go back. Do not switch tabs."
      >
        <GmaPlayer token={token} />
      </StageShell>
    </>
  );
}
