'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, ProgressBar } from '@cap/ui';
import { CanvasPrompt } from './CanvasPrompt';

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

export function GmaPlayer({ token }: { token: string }) {
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
        // Navigate back to the token router which picks the next unfinished stage.
        setTimeout(() => { window.location.href = `/s/${token}`; }, 1200);
        return;
      }
      itemStart.current = Date.now();
      setRemainingMs(data.item.remaining_ms);
      setUi({ phase: 'question', item: data.item, choice: null, submitting: false });
    } catch (e) {
      setUi({ phase: 'error', detail: String(e) });
    }
  }, [token]);

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
        Section complete — {ui.correct} of {ui.total} correct. Moving to the next section…
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
      <div style={{ marginBottom: 16 }}>
        <CanvasPrompt text={item.prompt} seed={item.item_id} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {item.choices.map((c, i) => {
          const active = choice === i;
          return (
            <button
              key={i}
              type="button"
              onClick={() => setUi({ ...ui, choice: i })}
              disabled={submitting}
              className={['cap-choice-btn', active && 'cap-choice-btn--selected'].filter(Boolean).join(' ')}
              aria-pressed={active}
            >
              <span style={{
                flexShrink: 0,
                width: 22, height: 22,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: 'var(--cap-font-mono)',
                fontSize: 11,
                fontWeight: 600,
                color: active ? 'var(--cap-accent)' : 'var(--cap-fg-3)',
                background: active ? 'var(--cap-accent-surface)' : 'var(--cap-surface-2)',
                borderRadius: 4,
                border: active ? '1px solid var(--cap-accent-glow)' : '1px solid var(--cap-border)',
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
