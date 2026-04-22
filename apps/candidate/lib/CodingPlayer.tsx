'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@cap/ui';
import { B_CODING_PROBLEM } from './coding-problems';

type Phase = 'coding' | 'submitting' | 'done' | 'error';

const ELAPSED_LIMIT_S = 90 * 60; // 90 min soft display limit

export function CodingPlayer() {
  const problem = B_CODING_PROBLEM;
  const [code, setCode] = useState(problem.starterCode);
  const [phase, setPhase] = useState<Phase>('coding');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef(Date.now());

  // Elapsed timer
  useEffect(() => {
    const id = window.setInterval(() => {
      setElapsed(Math.floor((Date.now() - startRef.current) / 1000));
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  async function submit() {
    setPhase('submitting');
    const res = await fetch('/api/stages/b_coding/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ code, language: problem.language }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({})) as { error?: string };
      setErrorMsg(j.error ?? `HTTP ${res.status}`);
      setPhase('error');
      return;
    }
    setPhase('done');
    const tokenPath = window.location.pathname.replace(/\/b_coding$/, '');
    window.location.href = tokenPath;
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Tab') {
      e.preventDefault();
      const ta = e.currentTarget;
      const { selectionStart, selectionEnd } = ta;
      const newCode = code.slice(0, selectionStart) + '    ' + code.slice(selectionEnd);
      setCode(newCode);
      requestAnimationFrame(() => {
        ta.selectionStart = ta.selectionEnd = selectionStart + 4;
      });
    }
  }

  if (phase === 'done') return <Status tone="success">Submitted. Evaluating your solution…</Status>;
  if (phase === 'submitting') return <Status>Submitting…</Status>;
  if (phase === 'error') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Status tone="danger">{errorMsg}</Status>
        <Button variant="secondary" onClick={() => setPhase('coding')}>Back to editor</Button>
      </div>
    );
  }

  const mins = String(Math.floor(elapsed / 60)).padStart(2, '0');
  const secs = String(elapsed % 60).padStart(2, '0');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Timer */}
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <span style={{
          fontFamily: 'var(--cap-font-mono)', fontSize: 13,
          color: elapsed > ELAPSED_LIMIT_S ? 'var(--cap-danger)' : 'var(--cap-fg-2)',
        }}>
          {mins}:{secs}
        </span>
      </div>

      {/* Problem description */}
      <div style={{
        padding: '16px 18px',
        background: 'var(--cap-surface-2, rgba(255,255,255,0.04))',
        border: '1px solid var(--cap-border)',
        borderRadius: 'var(--cap-radius-md)',
        fontSize: 13.5, lineHeight: 1.75, color: 'var(--cap-fg-1)',
        whiteSpace: 'pre-wrap',
      }}>
        <p style={{ margin: '0 0 10px', fontSize: 11, fontWeight: 600, color: 'var(--cap-fg-2)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Problem
        </p>
        <DescriptionRenderer text={problem.description} />
      </div>

      {/* Language badge */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{
          fontFamily: 'var(--cap-font-mono)', fontSize: 11, fontWeight: 600,
          padding: '3px 8px', borderRadius: 4,
          background: 'var(--cap-accent-muted)', color: 'var(--cap-accent)',
          border: '1px solid var(--cap-accent)',
        }}>
          Python 3
        </span>
        <span style={{ fontSize: 12, color: 'var(--cap-fg-3)' }}>
          Write your solution in the editor below. Tab inserts 4 spaces.
        </span>
      </div>

      {/* Code editor */}
      <textarea
        value={code}
        onChange={(e) => setCode(e.target.value)}
        onKeyDown={handleKeyDown}
        spellCheck={false}
        rows={18}
        style={{
          width: '100%', boxSizing: 'border-box',
          padding: '14px 16px', fontSize: 13.5,
          fontFamily: 'var(--cap-font-mono)',
          lineHeight: 1.6,
          background: 'hsl(220,13%,9%)',
          color: 'hsl(210,25%,88%)',
          border: '1px solid var(--cap-border)',
          borderRadius: 'var(--cap-radius-md)',
          resize: 'vertical',
          outline: 'none',
          tabSize: 4,
        }}
      />

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Button variant="primary" disabled={code.trim().length < 10} onClick={() => { void submit(); }}>
          Submit solution
        </Button>
      </div>
    </div>
  );
}

// Very lightweight markdown-to-text renderer (no external deps).
// Renders backtick code spans, **bold**, and table-like lines.
function DescriptionRenderer({ text }: { text: string }) {
  const lines = text.split('\n');
  return (
    <>
      {lines.map((line, i) => {
        // Table rows — render as pre
        if (line.startsWith('|')) {
          return (
            <div key={i} style={{ fontFamily: 'var(--cap-font-mono)', fontSize: 12, color: 'var(--cap-fg-2)', marginBottom: 2 }}>
              {line}
            </div>
          );
        }
        // Headings
        if (line.startsWith('**') && line.endsWith('**')) {
          return <p key={i} style={{ margin: '10px 0 4px', fontWeight: 600 }}>{line.replace(/\*\*/g, '')}</p>;
        }
        // Inline backtick
        const parts = line.split(/(`[^`]+`)/g);
        return (
          <p key={i} style={{ margin: '0 0 4px' }}>
            {parts.map((p, j) =>
              p.startsWith('`') && p.endsWith('`')
                ? <code key={j} style={{ fontFamily: 'var(--cap-font-mono)', fontSize: 12.5, background: 'rgba(255,255,255,0.07)', padding: '1px 5px', borderRadius: 3 }}>{p.slice(1, -1)}</code>
                : p
            )}
          </p>
        );
      })}
    </>
  );
}

function Status({ children, tone = 'default' }: { children: React.ReactNode; tone?: 'default' | 'danger' | 'success' }) {
  const color = tone === 'danger' ? 'var(--cap-danger)' : tone === 'success' ? 'var(--cap-success)' : 'var(--cap-fg-2)';
  return <div style={{ padding: 'var(--cap-space-5)', color, fontSize: 14 }}>{children}</div>;
}
