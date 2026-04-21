import type { InputHTMLAttributes } from 'react';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  error?: string;
  mono?: boolean;
}

export function Input({ label, hint, error, mono, id, style, ...rest }: InputProps) {
  const htmlId = id ?? `in-${Math.random().toString(36).slice(2, 8)}`;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      {label && (
        <label htmlFor={htmlId} style={{
          fontSize: 11, fontWeight: 500, color: 'var(--cap-fg-2)',
          letterSpacing: '0.04em', textTransform: 'uppercase',
        }}>{label}</label>
      )}
      <input
        id={htmlId}
        className="cap-focus"
        style={{
          background: 'var(--cap-surface)',
          border: `1px solid ${error ? 'var(--cap-danger)' : 'var(--cap-border)'}`,
          borderRadius: 'var(--cap-radius-md)',
          padding: '8px 10px',
          color: 'var(--cap-fg-1)',
          fontFamily: mono ? 'var(--cap-font-mono)' : 'var(--cap-font-sans)',
          fontSize: 13,
          outline: 'none',
          ...style,
        }}
        {...rest}
      />
      {error && <span style={{ fontSize: 11, color: 'var(--cap-danger)' }}>{error}</span>}
      {hint && !error && <span style={{ fontSize: 11, color: 'var(--cap-fg-3)' }}>{hint}</span>}
    </div>
  );
}
