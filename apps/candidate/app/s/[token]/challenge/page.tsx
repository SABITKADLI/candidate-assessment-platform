import { redirect } from 'next/navigation';
import { sql } from '@cap/db';
import { zResumeToken } from '@cap/shared/schemas';
import { StageShell } from '@cap/ui';
import { turnstileEnabled } from '@/lib/turnstile';
import { TurnstileWidget } from '@/lib/TurnstileWidget';

export const dynamic = 'force-dynamic';

export default async function ChallengePage(
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  if (!zResumeToken.safeParse(token).success) redirect('/?reason=bad_token');

  // If Turnstile is soft-failed (dev), there's nothing to show — bounce back
  // to the entry route which will mint the session cookie directly.
  if (!turnstileEnabled) redirect(`/s/${token}`);

  // Validate the session exists and isn't expired WITHOUT minting cap_sess.
  // We do not commit to the session until Turnstile succeeds.
  const rows = await sql<Array<{ id: string; expires_at: Date; status: string }>>`
    SELECT id, expires_at, status::text AS status
    FROM app.sessions
    WHERE resume_token = ${token}
    LIMIT 1
  `;
  const s = rows[0];
  if (!s) redirect('/?reason=not_found');
  if (s.expires_at < new Date()) redirect('/?reason=expired');
  if (['completed','expired','abandoned','disqualified'].includes(s.status)) {
    redirect(`/?reason=${s.status}`);
  }

  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY!;

  return (
    <StageShell
      stageKey="VERIFY"
      title="Security check"
      subtitle="Please complete the verification below to continue."
    >
      <TurnstileWidget resumeToken={token} siteKey={siteKey} />
    </StageShell>
  );
}
