import { Card } from '@cap/ui';

const REASON_MESSAGES: Record<string, { title: string; body: string }> = {
  completed:     { title: 'Assessment complete', body: 'Thank you for completing your assessment. The recruiter will be in touch with next steps.' },
  expired:       { title: 'Session expired', body: 'Your assessment link has expired. Please contact the recruiter for a new invitation.' },
  disqualified:  { title: 'Session ended', body: 'This assessment session is no longer active. Please contact the recruiter if you have questions.' },
  abandoned:     { title: 'Session closed', body: 'This assessment session was closed. Please contact the recruiter if you believe this was an error.' },
  not_found:     { title: 'Link not found', body: 'This invitation link is invalid or has already been used. Please check the link in your email.' },
  bad_token:     { title: 'Invalid link', body: 'This invitation link appears to be malformed. Please use the original link from your invitation email.' },
  no_session:    { title: 'No active session', body: 'No active session found. Please use your invitation link to begin.' },
  wrong_stage:   { title: 'Session error', body: 'An unexpected error occurred. Please contact the recruiter.' },
};

const DEFAULT = { title: 'Access via invitation link', body: 'This site is invitation-only. Open the link in the email you received from your recruiter to begin your assessment.' };

export default async function Home({ searchParams }: { searchParams: Promise<{ reason?: string }> }) {
  const { reason } = await searchParams;
  const msg = reason ? (REASON_MESSAGES[reason] ?? DEFAULT) : DEFAULT;

  return (
    <main style={{
      minHeight: '100dvh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 'var(--cap-space-6)',
    }}>
      <Card style={{ padding: 'var(--cap-space-8)', maxWidth: 520, textAlign: 'center' }}>
        <div style={{
          fontFamily: 'var(--cap-font-mono)',
          fontSize: 11, letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: 'var(--cap-accent)',
          marginBottom: 8,
        }}>CAP · Candidate Assessment</div>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 600, color: 'var(--cap-fg-1)' }}>
          {msg.title}
        </h1>
        <p style={{
          marginTop: 12, marginBottom: 0,
          color: 'var(--cap-fg-2)', fontSize: 13, lineHeight: 1.6,
        }}>
          {msg.body}
        </p>
      </Card>
    </main>
  );
}
