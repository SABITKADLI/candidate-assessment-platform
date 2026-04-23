import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { sql } from '@cap/db';
import { StageShell } from '@cap/ui';
import { AntibotBoot } from '@/lib/AntibotBoot';
import { AsyncVideoPlayer } from '@/lib/AsyncVideoPlayer';

export const dynamic = 'force-dynamic';

export default async function BAsyncVideoPage() {
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
      <AntibotBoot stageKey="B_ASYNC_VIDEO" />
      <StageShell
        stageKey="B_ASYNC_VIDEO"
        title="Video response"
        subtitle="Record a spoken answer to the question below. You have 60 seconds to prepare and up to 3 minutes to respond."
      >
        <AsyncVideoPlayer />
      </StageShell>
    </>
  );
}
