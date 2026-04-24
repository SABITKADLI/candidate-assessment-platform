'use client';

import type { KeyboardEvent, ReactNode } from 'react';
import { LayoutDashboard, ListChecks, ShieldAlert, Settings } from 'lucide-react';

export interface SidebarItem {
  id: string;
  label: string;
  href?: string;
  icon?: ReactNode;
}

export interface SidebarProps {
  items?: SidebarItem[];
  activeId?: string;
  onNav?: (id: string) => void;
  footer?: ReactNode;
}

const DEFAULT_ITEMS: SidebarItem[] = [
  { id: 'dashboard', label: 'Dashboard', href: '/dashboard', icon: <LayoutDashboard size={15} strokeWidth={1.75} /> },
  { id: 'sessions',  label: 'Sessions',  href: '/sessions',  icon: <ListChecks     size={15} strokeWidth={1.75} /> },
  { id: 'flags',     label: 'Flags',     href: '/flags',     icon: <ShieldAlert    size={15} strokeWidth={1.75} /> },
  { id: 'settings',  label: 'Settings',  href: '/settings',  icon: <Settings       size={15} strokeWidth={1.75} /> },
];

/* CAP SVG monogram */
function CapMark() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true" focusable="false">
      <rect width="28" height="28" rx="6" fill="var(--cap-accent)" />
      {/* C */}
      <path d="M8 10.5C8 9.12 9.12 8 10.5 8H14v2h-3.5a.5.5 0 0 0-.5.5v7a.5.5 0 0 0 .5.5H14v2h-3.5C9.12 20 8 18.88 8 17.5v-7z" fill="#fff" />
      {/* A */}
      <path d="M15.5 8h1.6l3.4 12h-2.1l-.7-2.5H17l-.7 2.5H14.1L15.5 8zm.8 2.8-1 4.2h2l-1-4.2z" fill="#fff" />
    </svg>
  );
}

export function Sidebar({ items = DEFAULT_ITEMS, activeId, onNav, footer }: SidebarProps) {
  function handleKey(e: KeyboardEvent, id: string) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onNav?.(id);
    }
  }

  return (
    <>
      {/* Mobile backdrop / toggle handled at app level via CSS */}
      <aside
        style={{
          width: 220,
          background: 'var(--cap-surface)',
          borderRight: '1px solid var(--cap-border)',
          height: '100dvh',
          display: 'flex',
          flexDirection: 'column',
          position: 'sticky',
          top: 0,
          flexShrink: 0,
        }}
        aria-label="Main navigation"
      >
        {/* Brand area */}
        <div style={{
          padding: '16px 16px 14px',
          borderBottom: '1px solid var(--cap-border)',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}>
          <CapMark />
          <div>
            <div style={{
              fontFamily: 'var(--cap-font-sans)', fontSize: 13, fontWeight: 600,
              color: 'var(--cap-fg-1)', letterSpacing: '-0.01em',
            }}>CAP</div>
            <div style={{
              fontSize: 10, color: 'var(--cap-fg-3)', marginTop: 1,
              letterSpacing: '0.04em', textTransform: 'uppercase',
            }}>Recruiter console</div>
          </div>
        </div>

        {/* Nav */}
        <nav style={{ padding: '8px 6px', flex: 1, overflow: 'auto' }} aria-label="Primary">
          {items.map((item) => {
            const active = item.id === activeId;
            const cls = ['cap-sidebar-item', active && 'cap-sidebar-item--active'].filter(Boolean).join(' ');

            if (item.href && !onNav) {
              return (
                <a
                  key={item.id}
                  href={item.href}
                  className={cls}
                  aria-current={active ? 'page' : undefined}
                >
                  {item.icon && <span aria-hidden style={{ display: 'flex', flexShrink: 0, opacity: active ? 1 : 0.7 }}>{item.icon}</span>}
                  {item.label}
                </a>
              );
            }

            return (
              <button
                key={item.id}
                type="button"
                className={cls}
                aria-current={active ? 'page' : undefined}
                onClick={() => onNav?.(item.id)}
                onKeyDown={(e) => handleKey(e, item.id)}
              >
                {item.icon && <span aria-hidden style={{ display: 'flex', flexShrink: 0, opacity: active ? 1 : 0.7 }}>{item.icon}</span>}
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* Footer slot */}
        {footer && (
          <div style={{ padding: '10px 6px', borderTop: '1px solid var(--cap-border)' }}>
            {footer}
          </div>
        )}
      </aside>
    </>
  );
}
