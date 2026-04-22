'use client';

import { useState } from 'react';
import { Button } from '@cap/ui';

type Phase = 'writing' | 'submitting' | 'done' | 'error';

const TASK = {
  title: 'Technical design: API rate limiter',
  prompt: `A high-traffic REST API is experiencing abuse from a small number of clients making thousands of requests per minute.

**Your task:** Write a short technical design (300–800 words) for a rate-limiting system that:

1. Limits each client (identified by API key) to 1 000 requests per minute.
2. Returns a clear error response when the limit is exceeded.
3. Minimises added latency for well-behaved clients.
4. Scales horizontally across multiple API server instances.

**Your design should cover:**
- The algorithm or data structure you would use and why.
- Where the state lives and how it is shared across instances.
- How you handle edge cases (e.g. burst traffic, clock skew, redis downtime).
- Any trade-offs you are making.

You do not need to write production code — pseudocode snippets or bullet points are fine where they add clarity.`,
};

const MIN_WORDS = 50;

export function WorkSamplePlayer() {
  const [text, setText] = useState('');
  const [phase, setPhase] = useState<Phase>('writing');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const wordCount = text.trim().split(/\s+/).filter(Boolean).length;
  const canSubmit = wordCount >= MIN_WORDS;

  async function submit() {
    if (!canSubmit) return;
    setPhase('submitting');
    const res = await fetch('/api/stages/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({
        stage_key: 'B_WORK_SAMPLE',
        payload: { text, word_count: wordCount },
      }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({})) as { error?: string };
      setErrorMsg(j.error ?? `HTTP ${res.status}`);
      setPhase('error');
      return;
    }
    setPhase('done');
    const tokenPath = window.location.pathname.replace(/\/b_work_sample$/, '');
    window.location.href = tokenPath;
  }

  if (phase === 'done') return <Status tone="success">Thank you. Continuing…</Status>;
  if (phase === 'submitting') return <Status>Saving response…</Status>;
  if (phase === 'error') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Status tone="danger">{errorMsg}</Status>
        <Button variant="secondary" onClick={() => setPhase('writing')}>Back</Button>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Task description */}
      <div style={{
        padding: '18px 20px',
        background: 'var(--cap-surface-2, rgba(255,255,255,0.04))',
        border: '1px solid var(--cap-border)',
        borderRadius: 'var(--cap-radius-md)',
        fontSize: 14, lineHeight: 1.8, color: 'var(--cap-fg-1)',
      }}>
        <p style={{ margin: '0 0 12px', fontWeight: 600, fontSize: 15 }}>{TASK.title}</p>
        <TaskRenderer text={TASK.prompt} />
      </div>

      {/* Response area */}
      <div>
        <p style={{ margin: '0 0 8px', fontSize: 13, color: 'var(--cap-fg-2)' }}>
          Your design
        </p>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={16}
          placeholder="Write your technical design here…"
          style={{
            width: '100%', boxSizing: 'border-box',
            padding: '12px 14px', fontSize: 14,
            background: 'var(--cap-surface)', color: 'var(--cap-fg-1)',
            border: `1px solid var(--cap-border)`,
            borderRadius: 'var(--cap-radius-md)',
            fontFamily: 'var(--cap-font-sans)', resize: 'vertical',
            outline: 'none', lineHeight: 1.7,
          }}
        />
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{
          fontSize: 12,
          color: canSubmit ? 'var(--cap-fg-2)' : 'var(--cap-danger)',
        }}>
          {wordCount} words {canSubmit ? '' : `(${MIN_WORDS} minimum)`}
        </span>
        <Button variant="primary" disabled={!canSubmit} onClick={() => { void submit(); }}>
          Submit response
        </Button>
      </div>
    </div>
  );
}

function TaskRenderer({ text }: { text: string }) {
  const lines = text.split('\n');
  return (
    <>
      {lines.map((line, i) => {
        if (line.startsWith('**') && line.endsWith('**')) {
          return <p key={i} style={{ margin: '12px 0 4px', fontWeight: 600, fontSize: 13.5 }}>{line.replace(/\*\*/g, '')}</p>;
        }
        if (/^\d+\./.test(line) || line.startsWith('-')) {
          return (
            <p key={i} style={{ margin: '2px 0 2px 16px', fontSize: 13.5 }}>
              {renderInline(line)}
            </p>
          );
        }
        return (
          <p key={i} style={{ margin: '0 0 6px', fontSize: 13.5 }}>
            {renderInline(line)}
          </p>
        );
      })}
    </>
  );
}

function renderInline(line: string) {
  const parts = line.split(/(`[^`]+`|\*\*[^*]+\*\*)/g);
  return parts.map((p, j) => {
    if (p.startsWith('`') && p.endsWith('`')) {
      return <code key={j} style={{ fontFamily: 'var(--cap-font-mono)', fontSize: 12.5, background: 'rgba(255,255,255,0.07)', padding: '1px 5px', borderRadius: 3 }}>{p.slice(1, -1)}</code>;
    }
    if (p.startsWith('**') && p.endsWith('**')) {
      return <strong key={j}>{p.slice(2, -2)}</strong>;
    }
    return p;
  });
}

function Status({ children, tone = 'default' }: { children: React.ReactNode; tone?: 'default' | 'danger' | 'success' }) {
  const color = tone === 'danger' ? 'var(--cap-danger)' : tone === 'success' ? 'var(--cap-success)' : 'var(--cap-fg-2)';
  return <div style={{ padding: 'var(--cap-space-5)', color, fontSize: 14 }}>{children}</div>;
}
