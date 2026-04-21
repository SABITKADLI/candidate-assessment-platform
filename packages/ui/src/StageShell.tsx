import type { ReactNode } from 'react';
import { StagePill, ProgressBar } from './Card';

export interface StageShellProps {
  /** Stage identifier, e.g. 'A_GMA' */
  stageKey: string;
  /** Human label, e.g. 'General mental ability' */
  title: string;
  /** Short instruction line shown under the title */
  subtitle?: string;
  /** Progress % 0..100; hidden if undefined */
  progress?: number;
  /** Right-side detail, e.g. "Question 12 / 50" or "07:32 remaining" */
  progressDetail?: string;
  children: ReactNode;
  /** Primary action row (pinned to bottom of the card) */
  footer?: ReactNode;
}

/**
 * Full-viewport dark layout used by every candidate stage. The recruiter app
 * uses a sidebar-shell instead (see Sidebar). Centered, max-width constrained.
 */
export function StageShell({
  stageKey, title, subtitle, progress, progressDetail, children, footer,
}: StageShellProps) {
  return (
    <main style={{
      minHeight: '100dvh',
      background: 'var(--cap-bg)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 'var(--cap-space-6)',
    }}>
      <div style={{ width: '100%', maxWidth: 720 }}>
        <header style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <StagePill stage={stageKey} active />
          <h1 style={{
            margin: 0, fontSize: 20, fontWeight: 600, color: 'var(--cap-fg-1)',
          }}>{title}</h1>
        </header>
        {subtitle && (
          <p style={{ margin: '0 0 16px', color: 'var(--cap-fg-2)', fontSize: 13 }}>
            {subtitle}
          </p>
        )}
        {progress != null && (
          <div style={{ marginBottom: 20 }}>
            <ProgressBar value={progress} detail={progressDetail} />
          </div>
        )}
        <section style={{
          background: 'var(--cap-surface)',
          border: '1px solid var(--cap-border)',
          borderRadius: 'var(--cap-radius-lg)',
          padding: 'var(--cap-space-6)',
          boxShadow: 'var(--cap-shadow-sm)',
        }}>
          {children}
          {footer && (
            <div style={{
              marginTop: 24, paddingTop: 16, borderTop: '1px solid var(--cap-border)',
              display: 'flex', justifyContent: 'flex-end', gap: 8,
            }}>{footer}</div>
          )}
        </section>
      </div>
    </main>
  );
}
