import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { sql } from '@cap/db';
import { StageShell } from '@cap/ui';
import { AntibotBoot } from '@/lib/AntibotBoot';
import { ResumeUploader } from '@/lib/ResumeUploader';

export const dynamic = 'force-dynamic';

export default async function ResumeStage() {
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
      <AntibotBoot stageKey="A_RESUME" />
      <StageShell
        stageKey="A_RESUME"
        title="Resume & consent"
        subtitle="Upload your resume in PDF or DOCX format, then read and agree to the assessment terms to continue."
      >
        <ResumeUploader />
      </StageShell>
    </>
  );
}
