import { useId, type InputHTMLAttributes, type TextareaHTMLAttributes } from 'react';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  error?: string;
  helperText?: string;
  mono?: boolean;
}

export function Input({ label, hint, error, helperText, mono, id, className, ...rest }: InputProps) {
  const generatedId = useId();
  const htmlId = id ?? generatedId;
  const helperId = `${htmlId}-help`;
  const errorId = `${htmlId}-err`;
  const hasHelper = !!(hint || helperText);
  const hasError = !!error;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      {label && (
        <label htmlFor={htmlId} style={{
          fontSize: 'var(--cap-text-xs)', fontWeight: 500, color: 'var(--cap-fg-2)',
          letterSpacing: '0.04em', textTransform: 'uppercase',
        }}>
          {label}
        </label>
      )}
      <input
        id={htmlId}
        className={[
          'cap-input',
          mono && 'cap-input--mono',
          hasError && 'cap-input--error',
          className,
        ].filter(Boolean).join(' ')}
        aria-describedby={[hasError && errorId, hasHelper && helperId].filter(Boolean).join(' ') || undefined}
        aria-invalid={hasError || undefined}
        {...rest}
      />
      {hasError && (
        <span id={errorId} role="alert" style={{ fontSize: 'var(--cap-text-xs)', color: 'var(--cap-danger)' }}>
          {error}
        </span>
      )}
      {!hasError && (hint || helperText) && (
        <span id={helperId} style={{ fontSize: 'var(--cap-text-xs)', color: 'var(--cap-fg-3)' }}>
          {hint ?? helperText}
        </span>
      )}
    </div>
  );
}

/* Textarea variant — same design language as Input */
export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  hint?: string;
  error?: string;
  mono?: boolean;
}

export function Textarea({ label, hint, error, mono, id, className, ...rest }: TextareaProps) {
  const generatedId = useId();
  const htmlId = id ?? generatedId;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      {label && (
        <label htmlFor={htmlId} style={{
          fontSize: 'var(--cap-text-xs)', fontWeight: 500, color: 'var(--cap-fg-2)',
          letterSpacing: '0.04em', textTransform: 'uppercase',
        }}>
          {label}
        </label>
      )}
      <textarea
        id={htmlId}
        className={[
          'cap-input',
          mono && 'cap-input--mono',
          error && 'cap-input--error',
          className,
        ].filter(Boolean).join(' ')}
        aria-invalid={!!error || undefined}
        style={{ resize: 'vertical', minHeight: 80 }}
        {...rest}
      />
      {error && (
        <span role="alert" style={{ fontSize: 'var(--cap-text-xs)', color: 'var(--cap-danger)' }}>{error}</span>
      )}
      {!error && hint && (
        <span style={{ fontSize: 'var(--cap-text-xs)', color: 'var(--cap-fg-3)' }}>{hint}</span>
      )}
    </div>
  );
}
