import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  children: ReactNode;
}

export function Button({ variant = 'primary', size = 'md', disabled, children, style, ...rest }: ButtonProps) {
  const base: React.CSSProperties = {
    fontFamily: 'var(--cap-font-sans)',
    fontWeight: 500,
    border: '1px solid transparent',
    cursor: disabled ? 'not-allowed' : 'pointer',
    lineHeight: 1,
    transition: 'opacity 150ms ease, background 150ms ease',
    borderRadius: size === 'sm' ? 'var(--cap-radius-sm)' : 'var(--cap-radius-md)',
    fontSize: size === 'sm' ? 11 : size === 'lg' ? 15 : 13,
    padding: size === 'sm' ? '5px 10px' : size === 'lg' ? '10px 20px' : '7px 14px',
  };
  const variants: Record<Variant, React.CSSProperties> = {
    primary:   { background: 'var(--cap-accent)',       color: '#fff',                borderColor: 'var(--cap-accent)' },
    secondary: { background: 'var(--cap-surface-2)',    color: 'var(--cap-fg-1)',     borderColor: 'var(--cap-border)' },
    ghost:     { background: 'transparent',             color: 'var(--cap-fg-2)',     borderColor: 'transparent' },
    danger:    { background: 'var(--cap-danger-muted)', color: 'var(--cap-danger)',   borderColor: 'var(--cap-danger)' },
  };
  const v: React.CSSProperties = disabled
    ? { background: 'var(--cap-surface-2)', color: 'var(--cap-fg-3)', borderColor: 'var(--cap-border)' }
    : variants[variant];
  return (
    <button className="cap-focus" disabled={disabled} style={{ ...base, ...v, ...style }} {...rest}>
      {children}
    </button>
  );
}
