'use client';

import { useState } from 'react';

export interface MathPuzzleProps {
  seed: string;
  onSolved: () => void;
  onFailed: () => void;
}

interface MathData {
  a: number;
  b: number;
  options: number[];
  correct: number;
}

export function MathPuzzle({ seed, onSolved, onFailed }: MathPuzzleProps) {
  const { a, b, options, correct } = JSON.parse(seed) as MathData;
  const [done, setDone] = useState(false);

  const click = (val: number) => {
    if (done) return;
    setDone(true);
    if (val === correct) onSolved();
    else onFailed();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Verification puzzle"
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(13, 15, 20, 0.92)',
        zIndex: 1000,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 'var(--cap-space-6)',
      }}
    >
      <div style={{
        background: 'var(--cap-surface)',
        border: '1px solid var(--cap-border)',
        borderRadius: 'var(--cap-radius-lg)',
        boxShadow: 'var(--cap-shadow-lg)',
        padding: 'var(--cap-space-6)',
        width: 'min(420px, 100%)',
      }}>
        <div style={{
          fontFamily: 'var(--cap-font-mono)',
          fontSize: 11, letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: 'var(--cap-accent)',
          marginBottom: 8,
        }}>
          Quick check
        </div>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: 'var(--cap-fg-1)' }}>
          Solve the equation
        </h2>
        <div style={{
          margin: '16px 0 20px',
          textAlign: 'center',
          fontFamily: 'var(--cap-font-mono)',
          fontSize: 32,
          fontWeight: 700,
          color: 'var(--cap-fg-1)',
          letterSpacing: '-0.01em',
        }}>
          {a} + {b} = ?
        </div>
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 10,
        }}>
          {options.map((val) => (
            <button
              key={val}
              onClick={() => click(val)}
              disabled={done}
              className="cap-focus"
              style={{
                padding: '14px 12px',
                borderRadius: 'var(--cap-radius-md)',
                background: 'var(--cap-surface-2)',
                border: '1px solid var(--cap-border)',
                color: 'var(--cap-fg-1)',
                fontFamily: 'var(--cap-font-mono)',
                fontSize: 20,
                fontWeight: 700,
                cursor: done ? 'not-allowed' : 'pointer',
                transition: 'background 120ms ease, border-color 120ms ease',
              }}
            >
              {val}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
