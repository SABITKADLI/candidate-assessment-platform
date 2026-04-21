import type { SessionStatus, FlagSeverity } from '@cap/shared';

type StatusStyle = { color: string; bg: string; border: string };

const STATUS_MAP: Record<SessionStatus, StatusStyle> = {
  pending:       { color: 'var(--cap-fg-2)',     bg: 'var(--cap-surface-2)',    border: 'var(--cap-border)' },
  in_progress:   { color: 'var(--cap-accent)',   bg: 'var(--cap-accent-muted)', border: 'var(--cap-accent)' },
  paused:        { color: 'var(--cap-warning)',  bg: 'var(--cap-warning-muted)',border: 'var(--cap-warning)' },
  completed:     { color: 'var(--cap-success)',  bg: 'var(--cap-success-muted)',border: 'var(--cap-success)' },
  disqualified:  { color: 'var(--cap-danger)',   bg: 'var(--cap-danger-muted)', border: 'var(--cap-danger)' },
  expired:       { color: 'var(--cap-fg-3)',     bg: 'var(--cap-surface)',      border: 'var(--cap-border)' },
  abandoned:     { color: 'var(--cap-fg-3)',     bg: 'var(--cap-surface)',      border: 'var(--cap-border)' },
};

const FLAG_MAP: Record<FlagSeverity, { color: string; bg: string }> = {
  info:     { color: 'var(--cap-info)',     bg: 'var(--cap-info-muted)' },
  low:      { color: 'var(--cap-success)',  bg: 'var(--cap-success-muted)' },
  medium:   { color: 'var(--cap-warning)',  bg: 'var(--cap-warning-muted)' },
  high:     { color: 'var(--cap-danger)',   bg: 'var(--cap-danger-muted)' },
  critical: { color: 'var(--cap-critical)', bg: 'var(--cap-critical-muted)' },
};

export function StatusBadge({ status }: { status: SessionStatus }) {
  const s = STATUS_MAP[status]!;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '3px 8px', borderRadius: 'var(--cap-radius-sm)',
      fontSize: 10, fontWeight: 600,
      fontFamily: 'var(--cap-font-mono)',
      letterSpacing: '0.07em', textTransform: 'uppercase',
      background: s.bg, color: s.color, border: `1px solid ${s.border}`,
    }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'currentColor' }} />
      {status.replace('_', ' ')}
    </span>
  );
}

export function FlagBadge({ severity }: { severity: FlagSeverity }) {
  const s = FLAG_MAP[severity]!;
  return (
    <span style={{
      padding: '2px 6px', borderRadius: 'var(--cap-radius-sm)',
      fontSize: 10, fontWeight: 600,
      fontFamily: 'var(--cap-font-mono)',
      letterSpacing: '0.06em', textTransform: 'uppercase',
      background: s.bg, color: s.color,
    }}>{severity}</span>
  );
}
