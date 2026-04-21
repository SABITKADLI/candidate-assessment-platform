'use client';

import { useMemo, useState } from 'react';

// Minimal puzzle: tap 5 numbered dots in ascending order. Positions are
// pseudo-random but deterministic per seed (server supplies it). Any out-of-
// order tap fails the puzzle; on failure the antibot scorer penalizes.
//
// This is a UX puzzle, not a CAPTCHA. It exists to catch automated clickers
// that don't know about number ordering + 2D positioning. Cheap to pass as a
// human, surprisingly annoying for a naive browser agent.

const N = 5;

export interface TapSeqPuzzleProps {
  seed: string;
  onSolved: () => void;
  onFailed: () => void;
}

export function TapSeqPuzzle({ seed, onSolved, onFailed }: TapSeqPuzzleProps) {
  const positions = useMemo(() => genPositions(seed, N), [seed]);
  const [next, setNext] = useState(1);
  const [done, setDone] = useState(false);

  const click = (n: number) => {
    if (done) return;
    if (n !== next) {
      setDone(true);
      onFailed();
      return;
    }
    if (n === N) {
      setDone(true);
      onSolved();
      return;
    }
    setNext(n + 1);
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
          Tap the dots in order
        </h2>
        <p style={{ margin: '6px 0 16px', fontSize: 13, color: 'var(--cap-fg-2)' }}>
          Starting with <strong style={{ color: 'var(--cap-fg-1)' }}>{next}</strong>, tap each number in order.
        </p>
        <div style={{
          position: 'relative', width: '100%', aspectRatio: '1 / 1',
          background: 'var(--cap-surface-2)',
          borderRadius: 'var(--cap-radius-md)',
          border: '1px solid var(--cap-border)',
        }}>
          {positions.map((p) => {
            const solved = p.n < next;
            const current = p.n === next;
            return (
              <button
                key={p.n}
                onClick={() => click(p.n)}
                disabled={done}
                aria-label={`Dot ${p.n}`}
                className="cap-focus"
                style={{
                  position: 'absolute',
                  left: `calc(${p.x}% - 24px)`,
                  top: `calc(${p.y}% - 24px)`,
                  width: 48, height: 48,
                  borderRadius: '50%',
                  background: solved
                    ? 'var(--cap-success-muted)'
                    : current
                      ? 'var(--cap-accent-muted)'
                      : 'var(--cap-surface-3)',
                  color: solved
                    ? 'var(--cap-success)'
                    : current
                      ? 'var(--cap-accent)'
                      : 'var(--cap-fg-2)',
                  border: `1px solid ${solved
                    ? 'var(--cap-success)'
                    : current
                      ? 'var(--cap-accent)'
                      : 'var(--cap-border)'}`,
                  fontFamily: 'var(--cap-font-mono)',
                  fontSize: 16, fontWeight: 600,
                  cursor: done ? 'not-allowed' : 'pointer',
                  transition: 'background 120ms ease, border-color 120ms ease, color 120ms ease',
                }}
              >
                {p.n}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function genPositions(seed: string, n: number): Array<{ n: number; x: number; y: number }> {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const rnd = () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
  // Reject-sample to avoid heavy overlap. 15% padding from edges.
  const out: Array<{ n: number; x: number; y: number }> = [];
  const minDist = 22;  // in percent
  for (let i = 1; i <= n; i++) {
    for (let tries = 0; tries < 50; tries++) {
      const x = 15 + rnd() * 70;
      const y = 15 + rnd() * 70;
      if (out.every((p) => Math.hypot(p.x - x, p.y - y) >= minDist)) {
        out.push({ n: i, x, y });
        break;
      }
    }
    if (out.length < i) out.push({ n: i, x: 50, y: 50 });  // fallback
  }
  return out;
}
