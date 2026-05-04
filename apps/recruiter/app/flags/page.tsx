import { requireRecruiterSession } from '@/lib/requireAuth';
import { sql } from '@cap/db';
import { Sidebar, FlagBadge, Card } from '@cap/ui';
import type { FlagSeverity } from '@cap/shared/enums';
import { ShieldCheck } from 'lucide-react';
import { FlagActions } from '@/lib/FlagActions';
import { resolveFlagReason, FLAG_GROUPS, FLAG_REASON_MAP } from '@/lib/flagReasons';

export const dynamic = 'force-dynamic';

type FlagRow = {
  id: string;
  severity: FlagSeverity;
  reason: string;
  resolved: boolean;
  created_at: Date;
  email: string | null;
  session_id: string;
  stage_key: string | null;
};

const SEV_COLOR: Record<FlagSeverity, string> = {
  critical: 'var(--cap-critical)',
  high:     'var(--cap-danger)',
  medium:   'var(--cap-warning)',
  low:      'var(--cap-fg-2)',
  info:     'var(--cap-info)',
};

const SEV_BG: Record<FlagSeverity, string> = {
  critical: 'var(--cap-critical-muted)',
  high:     'var(--cap-danger-muted)',
  medium:   'var(--cap-warning-muted)',
  low:      'var(--cap-surface-3)',
  info:     'var(--cap-info-muted)',
};

function FlagReference() {
  return (
    <details style={{ marginBottom: 'var(--cap-space-8)' }}>
      <summary style={{
        listStyle: 'none',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        cursor: 'pointer',
        userSelect: 'none',
        padding: '10px 16px',
        background: 'var(--cap-surface)',
        border: '1px solid var(--cap-border)',
        borderRadius: 'var(--cap-radius-lg)',
        fontSize: 13,
        fontWeight: 500,
        color: 'var(--cap-fg-2)',
        transition: 'background var(--cap-transition), color var(--cap-transition)',
      }}
        className="cap-flag-reference-summary"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
          stroke="var(--cap-accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          aria-hidden style={{ flexShrink: 0 }}>
          <circle cx="12" cy="12" r="10" />
          <line x1="12" x2="12" y1="8" y2="12" />
          <line x1="12" x2="12.01" y1="16" y2="16" />
        </svg>
        Flag reference — what each flag type means
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          aria-hidden style={{ marginLeft: 'auto', flexShrink: 0 }}
          className="cap-flag-reference-chevron"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </summary>

      <div style={{
        border: '1px solid var(--cap-border)',
        borderTop: 'none',
        borderRadius: '0 0 var(--cap-radius-lg) var(--cap-radius-lg)',
        background: 'var(--cap-surface)',
        padding: '20px 20px 20px',
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
        gap: 20,
      }}>
        {FLAG_GROUPS.map((group) => (
          <div key={group.title}>
            <div style={{
              fontSize: 10,
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              color: 'var(--cap-fg-3)',
              marginBottom: 10,
              paddingBottom: 6,
              borderBottom: '1px solid var(--cap-border)',
            }}>
              {group.title}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {group.reasons.map((reasonKey) => {
                const info = FLAG_REASON_MAP[reasonKey];
                if (!info) return null;
                return (
                  <div key={reasonKey} style={{
                    display: 'flex',
                    gap: 10,
                    alignItems: 'flex-start',
                  }}>
                    {/* Severity pill */}
                    <span style={{
                      flexShrink: 0,
                      marginTop: 1,
                      fontSize: 9,
                      fontWeight: 700,
                      fontFamily: 'var(--cap-font-mono)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                      padding: '2px 6px',
                      borderRadius: 4,
                      background: SEV_BG[info.severity],
                      color: SEV_COLOR[info.severity],
                      lineHeight: 1.6,
                    }}>
                      {info.severity}
                    </span>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--cap-fg-1)', marginBottom: 1 }}>
                        {info.label}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--cap-fg-2)', lineHeight: 1.55 }}>
                        {info.description}
                      </div>
                      <div style={{
                        marginTop: 3,
                        fontFamily: 'var(--cap-font-mono)',
                        fontSize: 10,
                        color: 'var(--cap-fg-3)',
                      }}>
                        {reasonKey} · score {info.scoreDelta}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </details>
  );
}

function EmptyState() {
  return (
    <div style={{
      padding: '64px 24px',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 14,
      textAlign: 'center',
    }}>
      <div style={{
        width: 52, height: 52,
        background: 'var(--cap-success-muted)',
        borderRadius: 12,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        border: '1px solid var(--cap-success-border)',
      }}>
        <ShieldCheck size={24} strokeWidth={1.5} color="var(--cap-success)" aria-hidden />
      </div>
      <div>
        <p style={{ margin: '0 0 4px', fontSize: 14, fontWeight: 500, color: 'var(--cap-fg-1)' }}>
          No flags raised
        </p>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--cap-fg-3)', lineHeight: 1.6 }}>
          All sessions are clean. Proctoring flags will appear here when triggered.
        </p>
      </div>
    </div>
  );
}

const SEVERITY_SORT: Record<FlagSeverity, number> = {
  critical: 0, high: 1, medium: 2, low: 3, info: 4,
};

const TH_STYLE = {
  padding: '10px 14px',
  textAlign: 'left' as const,
  fontSize: '11px',
  fontWeight: 500,
  color: 'var(--cap-fg-2)',
  textTransform: 'uppercase' as const,
  letterSpacing: '0.07em',
  borderBottom: '1px solid var(--cap-border)',
  whiteSpace: 'nowrap' as const,
};

function FlagSection({
  title,
  flags,
  muted = false,
}: {
  title: string;
  flags: FlagRow[];
  muted?: boolean;
}) {
  if (flags.length === 0) return null;

  return (
    <section aria-labelledby={`section-${muted ? 'resolved' : 'open'}`} style={{ marginBottom: 'var(--cap-space-8)' }}>
      <h2
        id={`section-${muted ? 'resolved' : 'open'}`}
        style={{
          margin: '0 0 12px',
          fontSize: 'var(--cap-text-base)',
          fontWeight: 600,
          color: muted ? 'var(--cap-fg-2)' : 'var(--cap-fg-1)',
          letterSpacing: '-0.01em',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        {title}
        <span style={{
          fontSize: 10, fontWeight: 600,
          fontFamily: 'var(--cap-font-mono)',
          color: 'var(--cap-fg-3)',
          background: 'var(--cap-surface-2)',
          padding: '1px 7px',
          borderRadius: 9999,
          border: '1px solid var(--cap-border)',
        }}>
          {flags.length}
        </span>
      </h2>

      <Card style={{ overflow: 'hidden' }}>
        <table
          style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}
          aria-label={title}
        >
          <thead>
            <tr>
              {['Severity', 'Reason', 'Stage', 'Candidate', 'Raised', 'Actions'].map((h) => (
                <th key={h} scope="col" style={TH_STYLE}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {flags.map((f) => {
              const isCritical = f.severity === 'critical' && !muted;
              const sessionHref = `/sessions/${f.session_id}`;
              const flagHref   = `/sessions/${f.session_id}#flag-${f.id}`;
              return (
                <tr
                  key={f.id}
                  className="cap-table-row"
                  style={{
                    opacity: muted ? 0.65 : 1,
                    background: isCritical ? 'var(--cap-critical-tint)' : undefined,
                  }}
                >
                  <td style={{ padding: '11px 14px' }}>
                    <FlagBadge severity={f.severity} />
                  </td>
                  <td style={{
                    padding: '11px 14px',
                    maxWidth: 280,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}>
                    {(() => {
                      const info = resolveFlagReason(f.reason);
                      return (
                        <a
                          href={flagHref}
                          className="cap-flag-reason"
                          style={{ textDecoration: 'none' }}
                          title={info.description}
                        >
                          <span style={{
                            display: 'block',
                            fontSize: 12,
                            fontWeight: 500,
                            color: isCritical ? 'var(--cap-danger)' : 'var(--cap-fg-1)',
                            marginBottom: 1,
                          }}>
                            {info.label}
                          </span>
                          <span style={{
                            fontFamily: 'var(--cap-font-mono)',
                            fontSize: 10,
                            color: 'var(--cap-fg-3)',
                          }}>
                            {f.reason}
                          </span>
                        </a>
                      );
                    })()}
                  </td>
                  <td style={{
                    padding: '11px 14px',
                    fontFamily: 'var(--cap-font-mono)',
                    fontSize: 11,
                    color: 'var(--cap-fg-2)',
                    whiteSpace: 'nowrap',
                  }}>
                    {f.stage_key ?? '—'}
                  </td>
                  <td style={{
                    padding: '11px 14px',
                    fontSize: 13,
                    maxWidth: 180,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}>
                    <a
                      href={sessionHref}
                      style={{ color: 'var(--cap-accent)', textDecoration: 'none', fontWeight: 500 }}
                      title="Open session detail"
                    >
                      {f.email ?? '—'}
                    </a>
                  </td>
                  <td style={{
                    padding: '11px 14px',
                    fontFamily: 'var(--cap-font-mono)',
                    fontSize: 11,
                    color: 'var(--cap-fg-2)',
                    whiteSpace: 'nowrap',
                  }}>
                    {f.created_at.toISOString().slice(0, 16).replace('T', ' ')}
                  </td>
                  <td style={{ padding: '11px 14px' }}>
                    <FlagActions id={f.id} resolved={f.resolved} severity={f.severity} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </section>
  );
}

export default async function FlagsPage() {
  await requireRecruiterSession();

  const flags = await sql<FlagRow[]>`
    SELECT f.id, f.severity::text AS severity, f.reason, f.resolved,
           f.created_at, f.stage_key::text AS stage_key,
           s.id AS session_id, c.email
    FROM app.proctoring_flags f
    JOIN app.sessions s ON s.id = f.session_id
    JOIN app.candidates c ON c.id = s.candidate_id
    ORDER BY f.resolved ASC, f.created_at DESC
    LIMIT 200
  `;

  const open = flags
    .filter((f) => !f.resolved)
    .sort((a, b) => (SEVERITY_SORT[a.severity] ?? 9) - (SEVERITY_SORT[b.severity] ?? 9));
  const resolved = flags.filter((f) => f.resolved);

  return (
    <div style={{ display: 'flex', minHeight: '100dvh' }}>
      <Sidebar activeId="flags" />

      <main id="main-content" className="cap-main" style={{ flex: 1, padding: 'var(--cap-space-8)', minWidth: 0 }}>
        <header style={{ marginBottom: 'var(--cap-space-8)' }}>
          <h1 style={{
            margin: '0 0 4px',
            fontSize: 'var(--cap-text-xl)',
            fontWeight: 600,
            letterSpacing: '-0.02em',
            lineHeight: 1.25,
            color: 'var(--cap-fg-1)',
          }}>
            Proctoring flags
          </h1>
          <p style={{ margin: 0, fontSize: 'var(--cap-text-base)', color: 'var(--cap-fg-2)' }}>
            {open.length > 0
              ? <><span style={{ color: 'var(--cap-warning)', fontWeight: 500 }}>{open.length} open</span> · {resolved.length} resolved</>
              : `${resolved.length} resolved`}
          </p>
        </header>

        <FlagReference />

        {flags.length === 0 ? (
          <Card>
            <EmptyState />
          </Card>
        ) : (
          <>
            <FlagSection title="Open" flags={open} />
            <FlagSection title="Resolved" flags={resolved} muted />
          </>
        )}
      </main>
    </div>
  );
}
