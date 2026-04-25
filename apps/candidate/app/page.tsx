import { ThemeToggle } from '@cap/ui';

type Reason = {
  title: string;
  body: string;
  tone: 'success' | 'warning' | 'neutral' | 'danger' | 'info';
  badge: string;
};

const REASON_MAP: Record<string, Reason> = {
  completed:    { title: 'Assessment complete',    body: 'Thank you for completing your assessment. The recruiter will be in touch with next steps.',                  tone: 'success', badge: 'Complete' },
  expired:      { title: 'Session expired',        body: 'Your assessment link has expired. Please contact the recruiter for a new invitation.',                      tone: 'warning', badge: 'Expired' },
  disqualified: { title: 'Session ended',          body: 'This assessment session is no longer active. Please contact the recruiter if you have questions.',          tone: 'neutral', badge: 'Ended' },
  abandoned:    { title: 'Session closed',         body: 'This assessment session was closed. Please contact the recruiter if you believe this was an error.',        tone: 'neutral', badge: 'Closed' },
  not_found:    { title: 'Link not found',         body: 'This invitation link is invalid or has already been used. Please check the link in your email.',            tone: 'danger',  badge: 'Not found' },
  bad_token:    { title: 'Invalid link',           body: 'This invitation link appears to be malformed. Please use the original link from your invitation email.',    tone: 'danger',  badge: 'Invalid' },
  no_session:   { title: 'No active session',      body: 'No active session found. Please use your invitation link to begin.',                                        tone: 'info',    badge: 'No session' },
  wrong_stage:  { title: 'Session error',          body: 'An unexpected error occurred. Please contact the recruiter.',                                               tone: 'danger',  badge: 'Error' },
};

const DEFAULT: Reason = {
  title: 'Assessment portal',
  body: 'This site is invitation-only. Open the link in the email you received from your recruiter to begin your assessment.',
  tone: 'info',
  badge: 'Invitation only',
};

function StatusPill({ tone, label }: { tone: Reason['tone']; label: string }) {
  const color =
    tone === 'success' ? 'var(--cap-success)' :
    tone === 'warning' ? 'var(--cap-warning)' :
    tone === 'danger'  ? 'var(--cap-danger)'  :
    tone === 'info'    ? 'var(--cap-accent)'  :
                         'var(--cap-fg-2)';

  const bg =
    tone === 'success' ? 'var(--cap-success-muted)' :
    tone === 'warning' ? 'var(--cap-warning-muted)' :
    tone === 'danger'  ? 'var(--cap-danger-muted)'  :
    tone === 'info'    ? 'var(--cap-accent-surface)' :
                         'var(--cap-surface-2)';

  const border =
    tone === 'success' ? 'var(--cap-success-border)' :
    tone === 'warning' ? 'var(--cap-warning-border)' :
    tone === 'danger'  ? 'var(--cap-danger-border)'  :
    tone === 'info'    ? 'var(--cap-info-border)'    :
                         'var(--cap-border)';

  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      padding: '4px 10px',
      borderRadius: 9999,
      fontSize: 'var(--cap-text-xs)',
      fontFamily: 'var(--cap-font-mono)',
      fontWeight: 600,
      letterSpacing: '0.07em',
      textTransform: 'uppercase',
      background: bg,
      color,
      border: `1px solid ${border}`,
    }}>
      {label}
    </span>
  );
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>;
}) {
  const { reason } = await searchParams;
  const msg = reason ? (REASON_MAP[reason] ?? DEFAULT) : DEFAULT;

  return (
    <main
      id="main-content"
      style={{
        minHeight: '100dvh',
        background: 'var(--cap-bg)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'var(--cap-space-6)',
      }}
    >
      {/* Theme toggle — fixed top-right */}
      <div style={{ position: 'fixed', top: 14, right: 16, zIndex: 50 }}>
        <ThemeToggle />
      </div>

      <div
        className="cap-landing-card"
        style={{
          width: '100%',
          maxWidth: 440,
          background: 'var(--cap-surface)',
          border: '1px solid var(--cap-border)',
          borderRadius: 'var(--cap-radius-xl)',
          boxShadow: 'var(--cap-shadow-lg)',
          padding: '32px 32px 28px',
        }}
      >
        {/* Wordmark */}
        <div
          className="cap-landing-wordmark"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            marginBottom: 28,
            paddingBottom: 20,
            borderBottom: '1px solid var(--cap-border)',
          }}
        >
          <svg width="20" height="20" viewBox="0 0 28 28" fill="none" aria-hidden="true">
            <rect width="28" height="28" rx="6" fill="var(--cap-accent)" />
            <path d="M8 10.5C8 9.12 9.12 8 10.5 8H14v2h-3.5a.5.5 0 0 0-.5.5v7a.5.5 0 0 0 .5.5H14v2h-3.5C9.12 20 8 18.88 8 17.5v-7z" fill="#fff" />
            <path d="M15.5 8h1.6l3.4 12h-2.1l-.7-2.5H17l-.7 2.5H14.1L15.5 8zm.8 2.8-1 4.2h2l-1-4.2z" fill="#fff" />
          </svg>
          <span style={{
            fontSize: 12,
            fontFamily: 'var(--cap-font-mono)',
            fontWeight: 500,
            color: 'var(--cap-fg-3)',
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
          }}>
            Candidate portal
          </span>
        </div>

        {/* Status + content */}
        <div className="cap-landing-body">
          <div style={{ marginBottom: 14 }}>
            <StatusPill tone={msg.tone} label={msg.badge} />
          </div>
          <h1 style={{
            margin: '0 0 10px',
            fontSize: 'var(--cap-text-xl)',
            fontWeight: 600,
            color: 'var(--cap-fg-1)',
            letterSpacing: '-0.02em',
            lineHeight: 1.25,
          }}>
            {msg.title}
          </h1>
          <p style={{
            margin: 0,
            color: 'var(--cap-fg-2)',
            fontSize: 'var(--cap-text-base)',
            lineHeight: 1.75,
          }}>
            {msg.body}
          </p>
        </div>
      </div>
    </main>
  );
}
