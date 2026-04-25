import type { SessionStatus, FlagSeverity } from '@cap/shared';

type StatusStyle = { color: string; bg: string; border: string; dot: string; pulse?: boolean };

const STATUS_MAP: Record<SessionStatus, StatusStyle> = {
  pending:      { color: 'var(--cap-fg-2)',     bg: 'var(--cap-surface-2)',      border: 'var(--cap-border)',   dot: 'var(--cap-fg-3)' },
  in_progress:  { color: 'var(--cap-accent)',   bg: 'var(--cap-accent-surface)', border: 'var(--cap-accent)',   dot: 'var(--cap-accent)',   pulse: true },
  paused:       { color: 'var(--cap-warning)',  bg: 'var(--cap-warning-muted)',  border: 'var(--cap-warning)',  dot: 'var(--cap-warning)' },
  completed:    { color: 'var(--cap-success)',  bg: 'var(--cap-success-muted)',  border: 'var(--cap-success)',  dot: 'var(--cap-success)' },
  disqualified: { color: 'var(--cap-danger)',   bg: 'var(--cap-danger-muted)',   border: 'var(--cap-danger)',   dot: 'var(--cap-danger)' },
  expired:      { color: 'var(--cap-fg-3)',     bg: 'var(--cap-surface)',        border: 'var(--cap-border)',   dot: 'var(--cap-fg-3)' },
  abandoned:    { color: 'var(--cap-fg-3)',     bg: 'var(--cap-surface)',        border: 'var(--cap-border)',   dot: 'var(--cap-fg-3)' },
};

const FLAG_MAP: Record<FlagSeverity, { color: string; bg: string; border: string; pulse?: boolean }> = {
  info:     { color: 'var(--cap-info)',     bg: 'var(--cap-info-muted)',     border: 'var(--cap-info)' },
  low:      { color: 'var(--cap-success)',  bg: 'var(--cap-success-muted)',  border: 'var(--cap-success)' },
  medium:   { color: 'var(--cap-warning)',  bg: 'var(--cap-warning-muted)',  border: 'var(--cap-warning)' },
  high:     { color: 'var(--cap-danger)',   bg: 'var(--cap-danger-muted)',   border: 'var(--cap-danger)' },
  critical: { color: 'var(--cap-critical)', bg: 'var(--cap-critical-muted)', border: 'var(--cap-critical)', pulse: true },
};

export function StatusBadge({ status }: { status: SessionStatus }) {
  const s = STATUS_MAP[status]!;
  const label = status.replace(/_/g, ' ');
  return (
    <span
      aria-label={`Status: ${label}`}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        padding: '3px 8px', borderRadius: 'var(--cap-radius-sm)',
        fontSize: 'var(--cap-text-xs)', fontWeight: 600,
        fontFamily: 'var(--cap-font-mono)',
        letterSpacing: '0.07em', textTransform: 'uppercase',
        background: s.bg, color: s.color, border: `1px solid ${s.border}`,
      }}
    >
      <span
        aria-hidden="true"
        className={s.pulse ? 'cap-live-dot' : undefined}
        style={!s.pulse ? {
          width: 5, height: 5, borderRadius: '50%', background: s.dot, flexShrink: 0, display: 'inline-block',
        } : undefined}
      />
      {label}
    </span>
  );
}

export function FlagBadge({ severity }: { severity: FlagSeverity }) {
  const s = FLAG_MAP[severity]!;
  return (
    <span
      aria-label={`Severity: ${severity}`}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        padding: '3px 7px',
        borderRadius: 'var(--cap-radius-sm)',
        fontSize: 'var(--cap-text-xs)', fontWeight: 600,
        fontFamily: 'var(--cap-font-mono)',
        letterSpacing: '0.06em', textTransform: 'uppercase',
        background: s.bg, color: s.color,
        border: `1px solid ${s.border}`,
      }}
    >
      {s.pulse && (
        <span
          aria-hidden="true"
          className="cap-live-dot cap-live-dot--danger"
        />
      )}
      {severity}
    </span>
  );
}
