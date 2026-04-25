'use client';

import { type ButtonHTMLAttributes, type ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg' | 'xl';

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
          width="13"
          height="13"
          viewBox="0 0 24 24"
          style={{ flexShrink: 0 }}
        >
          <circle
            cx="12" cy="12" r="9"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeDasharray="28 56"
            strokeDashoffset="0"
            style={{
              transformOrigin: '12px 12px',
              animation: 'cap-btn-spin 0.9s linear infinite, cap-btn-dash 1.5s ease-in-out infinite',
            }}
          />
        </svg>
      )}
      {children}
    </button>
  );
}
