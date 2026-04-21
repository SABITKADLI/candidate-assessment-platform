'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, ProgressBar } from '@cap/ui';

type Item = {
  item_id: string;
  category: 'verbal' | 'numerical' | 'abstract';
  prompt: string;
  choices: string[];
  index: number;
  total: number;
  remaining_ms: number;
};

type NextResponse =
  | { kind: 'question'; item: Item }
  | { kind: 'done'; score: number; correct: number; total: number };

type UiState =
  | { phase: 'loading' }
  | { phase: 'question'; item: Item; choice: number | null; submitting: boolean }
  | { phase: 'done'; score: number; correct: number; total: number }
  | { phase: 'error'; detail: string };

export function GmaPlayer() {
  const [ui, setUi] = useState<UiState>({ phase: 'loading' });
  const [remainingMs, setRemainingMs] = useState<number | null>(null);
  const itemStart = useRef<number>(0);

  // Load next question (with optional answer submission).
  const step = useCallback(async (answer?: { item_id: string; shuffled_choice: number }) => {
    try {
      const body: Record<string, unknown> = {};
      if (answer) {
        body.answer = {
          item_id: answer.item_id,
          shuffled_choice: answer.shuffled_choice,
          t_client_ms: Math.max(0, Date.now() - itemStart.current),
        };
      }
      const res = await fetch('/api/stages/a_gma/next', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        credentials: 'same-origin',
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string; detail?: string };
        setUi({ phase: 'error', detail: j.error ?? `HTTP ${res.status}` });
        return;
      }
      const data = (await res.json()) as NextResponse;
      if (data.kind === 'done') {
        setUi({ phase: 'done', score: data.score, correct: data.correct, total: data.total });
        setRemainingMs(null);
        return;
      }
      itemStart.current = Date.now();
      setRemainingMs(data.item.remaining_ms);
      setUi({ phase: 'question', item: data.item, choice: null, submitting: false });
    } catch (e) {
      setUi({ phase: 'error', detail: String(e) });
    }
  }, []);

  // Initial fetch.
  useEffect(() => { void step(); }, [step]);

  // Countdown tick. Driven by the server's `remaining_ms` baseline; client
  // decrements locally. If it hits 0, the server will terminate on the next
  // request, so we force one.
  useEffect(() => {
    if (remainingMs == null) return;
    const startedAt = Date.now();
    const baseline = remainingMs;
    const id = window.setInterval(() => {
      const next = Math.max(0, baseline - (Date.now() - startedAt));
      setRemainingMs(next);
      if (next === 0) {
        window.clearInterval(id);
        void step();  // trigger server-side termination
      }
    }, 250);
    return () => window.clearInterval(id);
  }, [remainingMs, step]);

  if (ui.phase === 'loading') return <Status>Loading first question…</Status>;
  if (ui.phase === 'error')   return <Status tone="danger">Error: {ui.detail}</Status>;
  if (ui.phase === 'done') {
    return (
      <Status tone="success">
        Stage complete. You answered {ui.correct} of {ui.total} correctly. Score: {ui.score}.
      </Status>
    );
  }

  const { item, choice, submitting } = ui;
  const progressPct = ((item.index) / item.total) * 100;
  const mm = remainingMs == null ? 0 : Math.floor(remainingMs / 60000);
  const ss = remainingMs == null ? 0 : Math.floor((remainingMs % 60000) / 1000);
  const timeStr = `${mm.toString().padStart(2, '0')}:${ss.toString().padStart(2, '0')}`;

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <ProgressBar
          value={progressPct}
          label={`Question ${item.index + 1} of ${item.total}`}
          detail={`${timeStr} remaining · ${item.category}`}
        />
      </div>
      <div
        style={{
          fontSize: 16, lineHeight: 1.5, color: 'var(--cap-fg-1)',
          background: 'var(--cap-surface-2)',
          padding: 'var(--cap-space-5)',
          borderRadius: 'var(--cap-radius-md)',
          border: '1px solid var(--cap-border)',
          marginBottom: 16,
        }}
      >
        {item.prompt}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {item.choices.map((c, i) => {
          const active = choice === i;
          return (
            <button
              key={i}
              onClick={() => setUi({ ...ui, choice: i })}
              disabled={submitting}
              className="cap-focus"
              style={{
                textAlign: 'left',
                padding: '12px 14px',
                fontFamily: 'var(--cap-font-sans)',
                fontSize: 14,
                color: 'var(--cap-fg-1)',
                background: active ? 'var(--cap-accent-muted)' : 'var(--cap-surface)',
                border: `1px solid ${active ? 'var(--cap-accent)' : 'var(--cap-border)'}`,
                borderRadius: 'var(--cap-radius-md)',
                cursor: submitting ? 'not-allowed' : 'pointer',
                transition: 'background 150ms ease, border-color 150ms ease',
              }}
            >
              <span style={{
                display: 'inline-block', width: 22, textAlign: 'center',
                marginRight: 10, fontFamily: 'var(--cap-font-mono)',
                color: active ? 'var(--cap-accent)' : 'var(--cap-fg-2)',
              }}>
                {String.fromCharCode(65 + i)}
              </span>
              {c}
            </button>
          );
        })}
      </div>
      <div style={{ marginTop: 24, display: 'flex', justifyContent: 'flex-end' }}>
        <Button
          variant="primary"
          disabled={choice == null || submitting}
          onClick={async () => {
            if (choice == null) return;
            setUi({ ...ui, submitting: true });
            await step({ item_id: item.item_id, shuffled_choice: choice });
          }}
        >
          {submitting ? 'Submitting…' : item.index + 1 === item.total ? 'Finish' : 'Next'}
        </Button>
      </div>
    </div>
  );
}

function Status({ children, tone = 'default' }: { children: React.ReactNode; tone?: 'default' | 'danger' | 'success' }) {
  const color = tone === 'danger' ? 'var(--cap-danger)' : tone === 'success' ? 'var(--cap-success)' : 'var(--cap-fg-2)';
  return (
    <div style={{ padding: 'var(--cap-space-5)', color, fontSize: 14 }}>
      {children}
    </div>
  );
}
