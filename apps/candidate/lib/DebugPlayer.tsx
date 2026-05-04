'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@cap/ui';
import { B_DEBUG_PROBLEM } from './coding-problems';

type Phase = 'debugging' | 'submitting' | 'done' | 'error';

export function DebugPlayer() {
  const problem = B_DEBUG_PROBLEM;
  const [code, setCode] = useState(problem.starterCode);
  const [phase, setPhase] = useState<Phase>('debugging');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef(Date.now());

  useEffect(() => {
    const id = window.setInterval(() => {
      setElapsed(Math.floor((Date.now() - startRef.current) / 1000));
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  async function submit() {
    setPhase('submitting');
    const res = await fetch('/api/stages/b_debug/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ code, language: problem.language }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({})) as { error?: string; detail?: string };
      setErrorMsg(j.detail ?? j.error ?? `HTTP ${res.status}`);
      setPhase('error');
      return;
    }
    setPhase('done');
    const tokenPath = window.location.pathname.replace(/\/b_debug$/, '');
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

  if (phase === 'done') return <Status tone="success">Submitted. Evaluating your fix…</Status>;
  if (phase === 'submitting') return <Status>Submitting…</Status>;
  if (phase === 'error') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Status tone="danger">{errorMsg}</Status>
        <Button variant="secondary" onClick={() => setPhase('debugging')}>Back to editor</Button>
      </div>
    );
  }

  const mins = String(Math.floor(elapsed / 60)).padStart(2, '0');
  const secs = String(elapsed % 60).padStart(2, '0');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Timer */}
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <span style={{ fontFamily: 'var(--cap-font-mono)', fontSize: 13, color: 'var(--cap-fg-2)' }}>
          {mins}:{secs}
        </span>
      </div>

      {/* Instructions */}
      <div style={{
        padding: '16px 18px',
        background: 'var(--cap-surface-2, rgba(255,255,255,0.04))',
        border: '1px solid var(--cap-border)',
        borderRadius: 'var(--cap-radius-md)',
        fontSize: 13.5, lineHeight: 1.75, color: 'var(--cap-fg-1)',
      }}>
        <p style={{ margin: '0 0 10px', fontSize: 11, fontWeight: 600, color: 'var(--cap-fg-2)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Task
        </p>
        <p style={{ margin: '0 0 6px' }}>{problem.description.split('\n')[0]}</p>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--cap-fg-2)' }}>
          The code below contains <strong style={{ color: 'var(--cap-danger)' }}>two bugs</strong>. Find and fix them — do not rewrite the algorithm from scratch.
        </p>
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
          Edit the code below to fix the bugs. Tab inserts 4 spaces.
        </span>
      </div>

      {/* Code editor */}
      <textarea
        value={code}
        onChange={(e) => setCode(e.target.value)}
        onKeyDown={handleKeyDown}
        spellCheck={false}
        rows={16}
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
        <Button variant="primary" onClick={() => { void submit(); }}>
          Submit fix
        </Button>
      </div>
    </div>
  );
}

function Status({ children, tone = 'default' }: { children: React.ReactNode; tone?: 'default' | 'danger' | 'success' }) {
  const color = tone === 'danger' ? 'var(--cap-danger)' : tone === 'success' ? 'var(--cap-success)' : 'var(--cap-fg-2)';
  return <div style={{ padding: 'var(--cap-space-5)', color, fontSize: 14 }}>{children}</div>;
}
