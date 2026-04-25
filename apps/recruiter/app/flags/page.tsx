import { redirect } from 'next/navigation';
import { auth0, auth0Configured } from '@/lib/auth0';
import { sql } from '@cap/db';
import { Sidebar, FlagBadge, Card } from '@cap/ui';
import type { FlagSeverity } from '@cap/shared/enums';
import { ShieldCheck } from 'lucide-react';

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
              {['Severity', 'Reason', 'Stage', 'Candidate', 'Raised'].map((h) => (
                <th key={h} scope="col" style={TH_STYLE}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {flags.map((f) => {
              const isCritical = f.severity === 'critical' && !muted;
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
                    fontFamily: 'var(--cap-font-mono)',
                    fontSize: 11,
                    color: isCritical ? 'var(--cap-fg-1)' : 'var(--cap-fg-1)',
                    maxWidth: 280,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}>
                    {f.reason}
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
                    color: 'var(--cap-fg-2)',
                    maxWidth: 180,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}>
                    {f.email ?? '—'}
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
  if (auth0Configured) {
    const session = await auth0.getSession();
    if (!session) redirect('/');
  }

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
