'use client';

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
  const classes = [
    'cap-card',
    isInteractive && 'cap-card--interactive',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  const merged = { ...style };

  if (href) {
    return (
      <a href={href} className={classes} style={merged} aria-label={ariaLabel}>
        {children}
      </a>
    );
  }

  return (
    <div
      className={classes}
      style={merged}
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
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
          {label && (
            <span style={{
              fontSize: 'var(--cap-text-xs)', fontWeight: 500, color: 'var(--cap-fg-2)',
              textTransform: 'uppercase', letterSpacing: '0.06em',
            }}>{label}</span>
          )}
          {detail && (
            <span style={{
              fontSize: 'var(--cap-text-xs)', color: 'var(--cap-accent)',
              fontFamily: 'var(--cap-font-mono)', fontWeight: 500,
            }}>{detail}</span>
          )}
        </div>
      )}
      <div style={{
        background: 'var(--cap-surface-2)',
        borderRadius: 9999,
        height: 3,
        overflow: 'hidden',
      }}>
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
/*
 * Horizontal instrument-panel layout:
 * [icon] [label ··················] [value]
 *
 * Avoids the "hero metric" template (big center number, colored icon box).
 * Values are right-aligned mono — readable as a data column, not a KPI card.
 */
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

  const iconColor = tone === 'success' ? 'var(--cap-success)'
                  : tone === 'danger'  ? 'var(--cap-danger)'
                  : tone === 'warning' ? 'var(--cap-warning)'
                  : 'var(--cap-fg-3)';

  return (
    <Card style={{ padding: '14px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {icon && (
          <span aria-hidden style={{
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: iconColor,
          }}>
            {icon}
          </span>
        )}
        <span style={{
          flex: 1,
          fontSize: 'var(--cap-text-xs)',
          fontWeight: 500,
          color: 'var(--cap-fg-2)',
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          minWidth: 0,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {label}
        </span>
        {skeleton ? (
          <div className="cap-skeleton" style={{ height: 20, width: 40, borderRadius: 'var(--cap-radius-sm)', display: 'block', flexShrink: 0 }} />
        ) : (
          <span style={{
            flexShrink: 0,
            fontSize: 20,
            fontWeight: 600,
            color: toneColor,
            fontFamily: 'var(--cap-font-mono)',
            fontVariantNumeric: 'tabular-nums',
            letterSpacing: '-0.02em',
            lineHeight: 1,
          }}>{value}</span>
        )}
      </div>
      {sub && !skeleton && (
        <div style={{
          fontSize: 'var(--cap-text-xs)',
          color: tone !== 'default' ? toneColor : 'var(--cap-fg-3)',
          marginTop: 6,
          paddingLeft: icon ? 26 : 0,
          fontWeight: tone !== 'default' ? 500 : 400,
        }}>{sub}</div>
      )}
    </Card>
  );
}

/* ─── StagePill ─────────────────────────────────────────────────────────── */
export interface StagePillProps { stage: string; active?: boolean; done?: boolean }
export function StagePill({ stage, active, done }: StagePillProps) {
  const color  = done ? 'var(--cap-success)' : active ? 'var(--cap-accent)' : 'var(--cap-fg-3)';
  const bg     = done ? 'var(--cap-success-muted)' : active ? 'var(--cap-accent-muted)' : 'var(--cap-surface-2)';
  const border = done ? 'var(--cap-success-border)' : active ? 'var(--cap-accent-hover)' : 'var(--cap-border)';
  return (
    <span aria-label={`Stage: ${stage}${done ? ', completed' : active ? ', active' : ''}`} style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '3px 9px', borderRadius: 9999,
      fontSize: 'var(--cap-text-xs)', fontWeight: 600, fontFamily: 'var(--cap-font-mono)',
      letterSpacing: '0.08em', textTransform: 'uppercase',
      background: bg, color,
      border: `1px solid ${border}`,
    }}>
      {done && <span aria-hidden style={{ fontSize: 10 }}>✓</span>}
      {stage}
    </span>
  );
}
