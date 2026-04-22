import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { sql } from '@cap/db';
import { StageShell } from '@cap/ui';
import { AntibotBoot } from '@/lib/AntibotBoot';
import { MbtiPlayer } from '@/lib/MbtiPlayer';

export const dynamic = 'force-dynamic';

export default async function MbtiPage() {
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
      <AntibotBoot stageKey="A_MBTI" />
      <StageShell
        stageKey="A_MBTI"
        title="Preferences questionnaire"
        subtitle="93 pairs of phrases. For each pair, choose the one that describes you more accurately — even if neither feels like a perfect fit."
      >
        <MbtiPlayer />
      </StageShell>
    </>
  );
}
