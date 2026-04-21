import type { CSSProperties, ReactNode } from 'react';

export function Card({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div style={{
      background: 'var(--cap-surface)',
      border: '1px solid var(--cap-border)',
      borderRadius: 'var(--cap-radius-lg)',
      boxShadow: 'var(--cap-shadow-sm)',
      ...style,
    }}>{children}</div>
  );
}

export function Divider() {
  return <div style={{ borderTop: '1px solid var(--cap-border)', margin: '12px 0' }} />;
}

export interface ProgressBarProps { value: number; max?: number; label?: string; detail?: string }
export function ProgressBar({ value, max = 100, label, detail }: ProgressBarProps) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div>
      {(label || detail) && (
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
          {label && <span style={{
            fontSize: 11, fontWeight: 500, color: 'var(--cap-fg-2)',
            textTransform: 'uppercase', letterSpacing: '0.05em',
          }}>{label}</span>}
          {detail && <span style={{
            fontSize: 11, color: 'var(--cap-accent)', fontFamily: 'var(--cap-font-mono)',
          }}>{detail}</span>}
        </div>
      )}
      <div style={{ background: 'var(--cap-surface-2)', borderRadius: 9999, height: 6 }}>
        <div style={{
          background: 'var(--cap-accent)', width: `${pct}%`, height: 6, borderRadius: 9999,
          transition: 'width 250ms ease',
        }} />
      </div>
    </div>
  );
}

export interface StatCardProps { label: string; value: ReactNode; sub?: string; tone?: 'default' | 'success' | 'danger' | 'warning' }
export function StatCard({ label, value, sub, tone = 'default' }: StatCardProps) {
  const toneColor = tone === 'success' ? 'var(--cap-success)'
                   : tone === 'danger' ? 'var(--cap-danger)'
                   : tone === 'warning' ? 'var(--cap-warning)'
                   : 'var(--cap-fg-1)';
  return (
    <Card style={{ padding: '16px 20px', minWidth: 140 }}>
      <div style={{
        fontSize: 12, fontWeight: 500, color: 'var(--cap-fg-2)',
        textTransform: 'uppercase', letterSpacing: '0.05em',
      }}>{label}</div>
      <div style={{
        fontSize: 32, fontWeight: 600, color: toneColor,
        fontFamily: 'var(--cap-font-mono)', letterSpacing: '-0.02em', marginTop: 8,
      }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--cap-fg-2)', marginTop: 4 }}>{sub}</div>}
    </Card>
  );
}

export interface StagePillProps { stage: string; active?: boolean; done?: boolean }
export function StagePill({ stage, active, done }: StagePillProps) {
  const color = done ? 'var(--cap-success)' : active ? 'var(--cap-accent)' : 'var(--cap-fg-3)';
  const bg    = done ? 'var(--cap-success-muted)' : active ? 'var(--cap-accent-muted)' : 'var(--cap-surface-2)';
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '2px 8px', borderRadius: 9999,
      fontSize: 10, fontWeight: 600, fontFamily: 'var(--cap-font-mono)',
      letterSpacing: '0.08em', textTransform: 'uppercase',
      background: bg, color,
    }}>
      {done && <span aria-hidden>✓</span>}
      {stage}
    </span>
  );
}
