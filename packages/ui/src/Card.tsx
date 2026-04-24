import type { CSSProperties, MouseEventHandler, ReactNode } from 'react';

/* ─── Card ─────────────────────────────────────────────────────────────── */
interface CardProps {
  children: ReactNode;
  style?: CSSProperties;
  className?: string;
  onClick?: MouseEventHandler<HTMLDivElement | HTMLAnchorElement>;
  href?: string;
  'aria-label'?: string;
}

export function Card({ children, style, className, onClick, href, 'aria-label': ariaLabel }: CardProps) {
  const isInteractive = !!(onClick || href);
  const classes = ['cap-card', isInteractive && 'cap-card--interactive', className]
    .filter(Boolean)
    .join(' ');

  if (href) {
    return (
      <a href={href} className={classes} style={style} aria-label={ariaLabel}>
        {children}
      </a>
    );
  }

  return (
    <div
      className={classes}
      style={style}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      aria-label={ariaLabel}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') (onClick as unknown as (e: React.KeyboardEvent) => void)(e); } : undefined}
    >
      {children}
    </div>
  );
}

/* ─── Divider ───────────────────────────────────────────────────────────── */
export function Divider() {
  return <hr style={{ border: 'none', borderTop: '1px solid var(--cap-border)', margin: '12px 0' }} />;
}

/* ─── ProgressBar ───────────────────────────────────────────────────────── */
export interface ProgressBarProps {
  value: number;
  max?: number;
  label?: string;
  detail?: string;
}

export function ProgressBar({ value, max = 100, label, detail }: ProgressBarProps) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      {(label || detail) && (
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
          {label && (
            <span style={{
              fontSize: 'var(--cap-text-xs)', fontWeight: 500, color: 'var(--cap-fg-2)',
              textTransform: 'uppercase', letterSpacing: '0.05em',
            }}>{label}</span>
          )}
          {detail && (
            <span style={{
              fontSize: 'var(--cap-text-xs)', color: 'var(--cap-accent)', fontFamily: 'var(--cap-font-mono)',
            }}>{detail}</span>
          )}
        </div>
      )}
      <div style={{ background: 'var(--cap-surface-2)', borderRadius: 9999, height: 3 }}>
        <div style={{
          background: 'var(--cap-accent)',
          width: `${pct}%`,
          height: 3,
          borderRadius: 9999,
          transition: 'width var(--cap-transition-slow)',
        }} />
      </div>
    </div>
  );
}

/* ─── StatCard ──────────────────────────────────────────────────────────── */
export interface StatCardProps {
  label: string;
  value: ReactNode;
  sub?: string;
  tone?: 'default' | 'success' | 'danger' | 'warning';
  icon?: ReactNode;
  skeleton?: boolean;
}

export function StatCard({ label, value, sub, tone = 'default', icon, skeleton = false }: StatCardProps) {
  const toneColor = tone === 'success' ? 'var(--cap-success)'
                  : tone === 'danger'  ? 'var(--cap-danger)'
                  : tone === 'warning' ? 'var(--cap-warning)'
                  : 'var(--cap-fg-1)';

  return (
    <Card style={{ padding: '20px 20px 18px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{
            fontSize: 'var(--cap-text-xs)', fontWeight: 500, color: 'var(--cap-fg-2)',
            textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10,
          }}>
            {label}
          </div>
          {skeleton ? (
            <div className="cap-skeleton" style={{ height: 32, width: 80, borderRadius: 'var(--cap-radius-sm)', display: 'block' }} />
          ) : (
            <div style={{
              fontSize: 30, fontWeight: 600, color: toneColor,
              fontFamily: 'var(--cap-font-mono)',
              fontVariantNumeric: 'tabular-nums',
              letterSpacing: '-0.02em',
              lineHeight: 1,
            }}>{value}</div>
          )}
          {sub && !skeleton && (
            <div style={{ fontSize: 'var(--cap-text-xs)', color: 'var(--cap-fg-2)', marginTop: 6 }}>{sub}</div>
          )}
        </div>
        {icon && (
          <div style={{
            flexShrink: 0,
            width: 36, height: 36,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'var(--cap-surface-2)',
            borderRadius: 'var(--cap-radius-md)',
            color: 'var(--cap-fg-2)',
          }}>
            {icon}
          </div>
        )}
      </div>
    </Card>
  );
}

/* ─── StagePill ─────────────────────────────────────────────────────────── */
export interface StagePillProps { stage: string; active?: boolean; done?: boolean }
export function StagePill({ stage, active, done }: StagePillProps) {
  const color = done ? 'var(--cap-success)' : active ? 'var(--cap-accent)' : 'var(--cap-fg-3)';
  const bg    = done ? 'var(--cap-success-muted)' : active ? 'var(--cap-accent-muted)' : 'var(--cap-surface-2)';
  return (
    <span aria-label={`Stage: ${stage}${done ? ', completed' : active ? ', active' : ''}`} style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '2px 8px', borderRadius: 9999,
      fontSize: 'var(--cap-text-xs)', fontWeight: 600, fontFamily: 'var(--cap-font-mono)',
      letterSpacing: '0.08em', textTransform: 'uppercase',
      background: bg, color,
    }}>
      {done && <span aria-hidden>✓</span>}
      {stage}
    </span>
  );
}
