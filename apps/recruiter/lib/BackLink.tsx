'use client';
import { ArrowLeft } from 'lucide-react';

export function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        fontSize: 12, color: 'var(--cap-fg-3)', textDecoration: 'none',
        marginBottom: 16,
        transition: 'color var(--cap-transition)',
      }}
      onMouseOver={(e) => { e.currentTarget.style.color = 'var(--cap-fg-1)'; }}
      onMouseOut={(e) => { e.currentTarget.style.color = 'var(--cap-fg-3)'; }}
    >
      <ArrowLeft size={13} strokeWidth={2} aria-hidden />
      {label}
    </a>
  );
}
