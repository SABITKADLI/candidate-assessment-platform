/* Candidate landing / error page — calm, trustworthy, full-viewport */

type Reason = {
  title: string;
  body: string;
  icon: 'check' | 'clock' | 'lock' | 'info' | 'warning';
};

const REASON_MAP: Record<string, Reason> = {
  completed:    { title: 'Assessment complete',    body: 'Thank you for completing your assessment. The recruiter will be in touch with next steps.',                  icon: 'check' },
  expired:      { title: 'Session expired',        body: 'Your assessment link has expired. Please contact the recruiter for a new invitation.',                      icon: 'clock' },
  disqualified: { title: 'Session ended',          body: 'This assessment session is no longer active. Please contact the recruiter if you have questions.',          icon: 'lock' },
  abandoned:    { title: 'Session closed',         body: 'This assessment session was closed. Please contact the recruiter if you believe this was an error.',        icon: 'lock' },
  not_found:    { title: 'Link not found',         body: 'This invitation link is invalid or has already been used. Please check the link in your email.',            icon: 'warning' },
  bad_token:    { title: 'Invalid link',           body: 'This invitation link appears to be malformed. Please use the original link from your invitation email.',    icon: 'warning' },
  no_session:   { title: 'No active session',      body: 'No active session found. Please use your invitation link to begin.',                                        icon: 'info' },
  wrong_stage:  { title: 'Session error',          body: 'An unexpected error occurred. Please contact the recruiter.',                                               icon: 'warning' },
};

const DEFAULT: Reason = {
  title: 'Assessment portal',
  body: 'This site is invitation-only. Open the link in the email you received from your recruiter to begin your assessment.',
  icon: 'info',
};

/* Status icons — inline SVG for zero-dependency rendering */
function StatusIcon({ type }: { type: Reason['icon'] }) {
  const color =
    type === 'check'   ? 'var(--cap-success)'  :
    type === 'clock'   ? 'var(--cap-warning)'  :
    type === 'lock'    ? 'var(--cap-fg-2)'     :
    type === 'warning' ? 'var(--cap-danger)'   :
                         'var(--cap-accent)';

  const bg =
    type === 'check'   ? 'var(--cap-success-muted)' :
    type === 'clock'   ? 'var(--cap-warning-muted)' :
    type === 'lock'    ? 'var(--cap-surface-3)'     :
    type === 'warning' ? 'var(--cap-danger-muted)'  :
                         'var(--cap-accent-surface)';

  return (
    <div style={{
      width: 52, height: 52,
      background: bg,
      borderRadius: 14,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexShrink: 0,
    }}>
      {type === 'check' && (
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
        </svg>
      )}
      {type === 'clock' && (
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
        </svg>
      )}
      {type === 'lock' && (
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
      )}
      {type === 'warning' && (
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
          <line x1="12" x2="12" y1="9" y2="13" /><line x1="12" x2="12.01" y1="17" y2="17" />
        </svg>
      )}
      {type === 'info' && (
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <circle cx="12" cy="12" r="10" />
          <line x1="12" x2="12" y1="8" y2="12" /><line x1="12" x2="12.01" y1="16" y2="16" />
        </svg>
      )}
    </div>
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
        /* Faint radial gradient behind the card */
        backgroundImage: 'radial-gradient(ellipse 60% 50% at 50% 40%, rgba(59,130,246,0.06) 0%, transparent 70%)',
      }}
    >
      {/* Fade + slide-up entry */}
      <style>{`
        @keyframes cap-fadeslide {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .cap-landing-card {
          animation: cap-fadeslide 0.4s cubic-bezier(0.16, 1, 0.3, 1) both;
        }
        @media (prefers-reduced-motion: reduce) {
          .cap-landing-card { animation: none; }
        }
      `}</style>

      <div
        className="cap-landing-card"
        style={{
          width: '100%',
          maxWidth: 500,
          background: 'var(--cap-surface)',
          border: '1px solid var(--cap-border)',
          borderRadius: 'var(--cap-radius-xl)',
          boxShadow: 'var(--cap-shadow-lg)',
          padding: '36px 36px 32px',
        }}
      >
        {/* Wordmark */}
        <div style={{
          fontSize: 'var(--cap-text-xs)',
          fontFamily: 'var(--cap-font-mono)',
          fontWeight: 600,
          color: 'var(--cap-fg-3)',
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          marginBottom: 28,
        }}>
          CAP · Candidate portal
        </div>

        {/* Icon + content */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <StatusIcon type={msg.icon} />

          <div>
            <h1 style={{
              margin: '0 0 10px',
              fontSize: 'var(--cap-text-xl)',
              fontWeight: 600,
              color: 'var(--cap-fg-1)',
              letterSpacing: '-0.01em',
              lineHeight: 1.3,
            }}>
              {msg.title}
            </h1>
            <p style={{
              margin: 0,
              color: 'var(--cap-fg-2)',
              fontSize: 'var(--cap-text-base)',
              lineHeight: 1.7,
            }}>
              {msg.body}
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
