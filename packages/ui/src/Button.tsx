'use client';

import { type ButtonHTMLAttributes, type ReactNode, useId } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  isLoading?: boolean;
  children: ReactNode;
}

export function Button({
  variant = 'primary',
  size = 'md',
  isLoading = false,
  disabled,
  children,
  className,
  ...rest
}: ButtonProps) {
  const isDisabled = disabled || isLoading;
  const classes = [
    'cap-btn',
    `cap-btn-${variant}`,
    `cap-btn-${size}`,
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      className={classes}
      disabled={isDisabled}
      aria-disabled={isDisabled}
      aria-busy={isLoading || undefined}
      {...rest}
    >
      {isLoading && (
        <svg
          aria-hidden="true"
          width="12"
          height="12"
          viewBox="0 0 12 12"
          style={{ animation: 'cap-btn-spin 0.7s linear infinite', flexShrink: 0 }}
        >
          <circle cx="6" cy="6" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="14 8" />
        </svg>
      )}
      {children}
      <style>{`@keyframes cap-btn-spin { to { transform: rotate(360deg); } }`}</style>
    </button>
  );
}
