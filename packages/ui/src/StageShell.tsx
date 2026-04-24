import type { ReactNode } from 'react';
import { StagePill, ProgressBar } from './Card';

export interface StageShellProps {
  stageKey: string;
  title: string;
  subtitle?: string;
  progress?: number;
  progressDetail?: string;
  children: ReactNode;
  footer?: ReactNode;
}

export function StageShell({
  stageKey, title, subtitle, progress, progressDetail, children, footer,
}: StageShellProps) {
  const hasProgress = progress != null;

  return (
    <main style={{
      minHeight: '100dvh',
      background: 'var(--cap-bg)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
    }}>
      {/* Top progress bar — fixed strip at the very top */}
      {hasProgress && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0,
          height: 2,
          background: 'var(--cap-surface-2)',
          zIndex: 100,
        }}>
          <div style={{
            height: '100%',
            width: `${Math.max(0, Math.min(100, progress!))}%`,
            background: 'var(--cap-accent)',
            transition: 'width var(--cap-transition-slow)',
          }} />
        </div>
      )}

      {/* Centered content */}
      <div style={{
        width: '100%',
        maxWidth: 760,
        padding: `${hasProgress ? 'calc(var(--cap-space-12) + 2px)' : 'var(--cap-space-12)'} var(--cap-space-6) var(--cap-space-12)`,
      }}>
        {/* Header */}
        <header style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <StagePill stage={stageKey} active />
          <h1 style={{
            margin: 0,
            fontSize: 'var(--cap-text-xl)',
            fontWeight: 600,
            color: 'var(--cap-fg-1)',
            letterSpacing: '-0.01em',
          }}>
            {title}
          </h1>
        </header>

        {subtitle && (
          <p style={{
            margin: '0 0 20px',
            color: 'var(--cap-fg-2)',
            fontSize: 'var(--cap-text-base)',
            lineHeight: 1.65,
          }}>
            {subtitle}
          </p>
        )}

        {hasProgress && (
          <div style={{ marginBottom: 24 }}>
            <ProgressBar value={progress!} detail={progressDetail} />
          </div>
        )}

        {/* Content card */}
        <section style={{
          background: 'var(--cap-surface)',
          border: '1px solid var(--cap-border)',
          borderRadius: 'var(--cap-radius-xl)',
          padding: 'var(--cap-space-6)',
          boxShadow: 'var(--cap-shadow-md)',
        }}>
          {children}
          {footer && (
            <div style={{
              marginTop: 24,
              paddingTop: 18,
              borderTop: '1px solid var(--cap-border)',
              display: 'flex',
              justifyContent: 'flex-end',
              gap: 8,
            }}>
              {footer}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
