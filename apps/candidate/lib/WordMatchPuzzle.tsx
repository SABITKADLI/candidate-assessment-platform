'use client';

import { useState } from 'react';

export interface WordMatchPuzzleProps {
  seed: string;
  onSolved: () => void;
  onFailed: () => void;
}

interface WordMatchData {
  target: string;
  options: string[];
}

export function WordMatchPuzzle({ seed, onSolved, onFailed }: WordMatchPuzzleProps) {
  const { target, options } = JSON.parse(seed) as WordMatchData;
  const [done, setDone] = useState(false);

  const click = (word: string) => {
    if (done) return;
    setDone(true);
    if (word === target) onSolved();
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
          Tap the correct button
        </h2>
        <p style={{ margin: '6px 0 20px', fontSize: 13, color: 'var(--cap-fg-2)' }}>
          Click the button labelled{' '}
          <strong style={{
            color: 'var(--cap-accent)',
            fontFamily: 'var(--cap-font-mono)',
            fontSize: 14,
            background: 'var(--cap-accent-surface)',
            padding: '2px 8px',
            borderRadius: 4,
          }}>
            {target}
          </strong>
        </p>
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 10,
        }}>
          {options.map((word) => (
            <button
              key={word}
              onClick={() => click(word)}
              disabled={done}
              className="cap-focus"
              style={{
                padding: '14px 12px',
                borderRadius: 'var(--cap-radius-md)',
                background: 'var(--cap-surface-2)',
                border: '1px solid var(--cap-border)',
                color: 'var(--cap-fg-1)',
                fontFamily: 'var(--cap-font-mono)',
                fontSize: 14,
                fontWeight: 600,
                cursor: done ? 'not-allowed' : 'pointer',
                transition: 'background 120ms ease, border-color 120ms ease',
                letterSpacing: '0.04em',
              }}
            >
              {word}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
