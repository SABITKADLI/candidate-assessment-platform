'use client';

import { type KeyboardEvent, type ReactNode, useState, useEffect, useRef } from 'react';
import { LayoutDashboard, ListChecks, ShieldAlert, Settings, SendHorizonal, Menu, X } from 'lucide-react';
import { ThemeToggle } from './ThemeToggle';

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
  { id: 'outbox',    label: 'Outbox',    href: '/outbox',    icon: <SendHorizonal  size={15} strokeWidth={1.75} /> },
  { id: 'settings',  label: 'Settings',  href: '/settings',  icon: <Settings       size={15} strokeWidth={1.75} /> },
];

function CapMark() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true" focusable="false">
      <rect width="28" height="28" rx="6" fill="var(--cap-accent)" />
      <path d="M8 10.5C8 9.12 9.12 8 10.5 8H14v2h-3.5a.5.5 0 0 0-.5.5v7a.5.5 0 0 0 .5.5H14v2h-3.5C9.12 20 8 18.88 8 17.5v-7z" fill="#fff" />
      <path d="M15.5 8h1.6l3.4 12h-2.1l-.7-2.5H17l-.7 2.5H14.1L15.5 8zm.8 2.8-1 4.2h2l-1-4.2z" fill="#fff" />
    </svg>
  );
}

export function Sidebar({ items = DEFAULT_ITEMS, activeId, onNav, footer }: SidebarProps) {
  const [open, setOpen] = useState(false);
  const hamburgerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const sidebarRef = useRef<HTMLElement>(null);

  function close() { setOpen(false); }

  /* Focus trap + focus restoration for mobile overlay */
  useEffect(() => {
    if (!open) return;

    /* Move focus to close button when sidebar opens */
    closeRef.current?.focus();

    function handleKeyDown(e: globalThis.KeyboardEvent) {
      if (e.key === 'Escape') {
        close();
        hamburgerRef.current?.focus();
        return;
      }

      if (e.key !== 'Tab') return;

      const sidebar = sidebarRef.current;
      if (!sidebar) return;

      const focusable = Array.from(
        sidebar.querySelectorAll<HTMLElement>(
          'a[href], button:not(:disabled), [tabindex]:not([tabindex="-1"])'
        )
      );
      if (focusable.length === 0) return;

      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;

      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open]);

  function handleItemClick(id: string) {
    onNav?.(id);
    close();
    hamburgerRef.current?.focus();
  }

  function handleLinkClick() {
    close();
  }

  function handleKey(e: KeyboardEvent, id: string) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleItemClick(id);
    }
  }

  return (
    <>
      {/* Mobile hamburger — shown only on ≤767px via CSS */}
      <button
        ref={hamburgerRef}
        type="button"
        className="cap-hamburger"
        aria-label="Open navigation"
        aria-expanded={open}
        aria-controls="cap-sidebar"
        onClick={() => setOpen(true)}
      >
        <Menu size={18} strokeWidth={1.75} />
      </button>

      {/* Mobile backdrop */}
      {open && (
        <div
          className="cap-sidebar-backdrop"
          aria-hidden="true"
          onClick={() => { close(); hamburgerRef.current?.focus(); }}
        />
      )}

      <aside
        id="cap-sidebar"
        ref={sidebarRef}
        className="cap-sidebar-mobile-hidden"
        data-open={open}
        aria-modal={open ? 'true' : undefined}
        aria-label="Main navigation"
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
      >
        {/* Brand area */}
        <div style={{
          padding: '16px 16px 16px',
          borderBottom: '1px solid var(--cap-border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
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

          {/* Mobile close button */}
          <button
            ref={closeRef}
            type="button"
            onClick={() => { close(); hamburgerRef.current?.focus(); }}
            aria-label="Close navigation"
            style={{
              display: 'none',
              alignItems: 'center',
              justifyContent: 'center',
              width: 28,
              height: 28,
              borderRadius: 'var(--cap-radius-sm)',
              background: 'transparent',
              border: 'none',
              color: 'var(--cap-fg-2)',
              cursor: 'pointer',
            }}
            className="cap-sidebar-close-btn"
          >
            <X size={15} strokeWidth={1.75} />
          </button>
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
                  onClick={handleLinkClick}
                >
                  {item.icon && (
                    <span aria-hidden style={{
                      display: 'flex', flexShrink: 0, opacity: active ? 1 : 0.65,
                      transition: 'opacity var(--cap-transition)',
                    }}>
                      {item.icon}
                    </span>
                  )}
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
                onClick={() => handleItemClick(item.id)}
                onKeyDown={(e) => handleKey(e, item.id)}
              >
                {item.icon && (
                  <span aria-hidden style={{
                    display: 'flex', flexShrink: 0, opacity: active ? 1 : 0.65,
                    transition: 'opacity var(--cap-transition)',
                  }}>
                    {item.icon}
                  </span>
                )}
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* Footer slot */}
        <div style={{ padding: '10px 6px', borderTop: '1px solid var(--cap-border)' }}>
          {footer && <div style={{ marginBottom: 8 }}>{footer}</div>}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: 4 }}>
            <ThemeToggle />
          </div>
        </div>
      </aside>

    </>
  );
}
