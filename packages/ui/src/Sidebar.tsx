'use client';

import type { CSSProperties } from 'react';

export interface SidebarItem { id: string; label: string; href?: string }
export interface SidebarProps {
  items?: SidebarItem[];
  activeId?: string;
  onNav?: (id: string) => void;
  /** Optional footer slot below the nav (e.g. a sign-out link) */
  footer?: React.ReactNode;
}

const DEFAULT_ITEMS: SidebarItem[] = [
  { id: 'dashboard', label: 'Dashboard', href: '/dashboard' },
  { id: 'sessions',  label: 'Sessions',  href: '/sessions' },
  { id: 'flags',     label: 'Flags',     href: '/flags' },
  { id: 'settings',  label: 'Settings',  href: '/settings' },
];

export function Sidebar({ items = DEFAULT_ITEMS, activeId, onNav, footer }: SidebarProps) {
  const wrap: CSSProperties = {
    width: 220,
    background: 'var(--cap-surface)',
    borderRight: '1px solid var(--cap-border)',
    height: '100dvh',
    display: 'flex',
    flexDirection: 'column',
    padding: '20px 0',
  };
  return (
    <aside style={wrap}>
      <div style={{ padding: '0 16px 20px', borderBottom: '1px solid var(--cap-border)' }}>
        <div style={{
          fontFamily: 'var(--cap-font-mono)', fontSize: 13, fontWeight: 600,
          color: 'var(--cap-accent)', letterSpacing: '0.05em',
        }}>CAP</div>
        <div style={{
          fontSize: 10, color: 'var(--cap-fg-3)', marginTop: 2,
          letterSpacing: '0.05em', textTransform: 'uppercase',
        }}>Recruiter console</div>
      </div>
      <nav style={{ padding: '12px 8px', flex: 1 }}>
        {items.map((it) => {
          const active = it.id === activeId;
          const style: CSSProperties = {
            padding: '8px 10px', borderRadius: 'var(--cap-radius-md)',
            fontSize: 13, fontWeight: active ? 500 : 400,
            color: active ? 'var(--cap-fg-1)' : 'var(--cap-fg-2)',
            background: active ? 'var(--cap-surface-2)' : 'transparent',
            cursor: 'pointer', display: 'block', textDecoration: 'none',
            transition: 'background 150ms ease',
          };
          if (it.href && !onNav) {
            return <a key={it.id} href={it.href} style={style}>{it.label}</a>;
          }
          return (
            <div
              key={it.id}
              role="button"
              tabIndex={0}
              onClick={() => onNav?.(it.id)}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onNav?.(it.id)}
              style={style}
            >
              {it.label}
            </div>
          );
        })}
      </nav>
      {footer && (
        <div style={{ padding: '12px 8px', borderTop: '1px solid var(--cap-border)' }}>
          {footer}
        </div>
      )}
    </aside>
  );
}
