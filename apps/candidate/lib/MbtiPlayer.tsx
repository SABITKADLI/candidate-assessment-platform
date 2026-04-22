'use client';

import { useState } from 'react';
import { Button } from '@cap/ui';
import { MBTI_ITEMS, scoreMbti } from './mbti-items';

const PAGE_SIZE = 10;
const TOTAL_PAGES = Math.ceil(MBTI_ITEMS.length / PAGE_SIZE);

type Phase = 'questions' | 'submitting' | 'done' | 'error';

export function MbtiPlayer() {
  const [answers, setAnswers] = useState<Record<string, 'a' | 'b'>>({});
  const [page, setPage] = useState(0);
  const [phase, setPhase] = useState<Phase>('questions');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const pageItems = MBTI_ITEMS.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const pageAnswered = pageItems.every((item) => answers[item.id] != null);
  const totalAnswered = Object.keys(answers).length;
  const progress = Math.round((totalAnswered / MBTI_ITEMS.length) * 100);
  const isLastPage = page === TOTAL_PAGES - 1;

  async function finish() {
    if (!pageAnswered) return;
    setPhase('submitting');

    const { type, scores } = scoreMbti(answers);
    const res = await fetch('/api/stages/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({
        stage_key: 'A_MBTI',
        payload: { answers, type, scores },
      }),
    });

    if (!res.ok) {
      const j = await res.json().catch(() => ({})) as { error?: string };
      setErrorMsg(j.error ?? `HTTP ${res.status}`);
      setPhase('error');
      return;
    }
    setPhase('done');
    const tokenPath = window.location.pathname.replace(/\/a_mbti$/, '');
    window.location.href = tokenPath;
  }

  if (phase === 'done') return <Status tone="success">Thank you. Continuing…</Status>;
  if (phase === 'submitting') return <Status>Saving your responses…</Status>;
  if (phase === 'error') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Status tone="danger">{errorMsg}</Status>
        <Button variant="secondary" onClick={() => setPhase('questions')}>Retry</Button>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Progress */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 12, color: 'var(--cap-fg-2)' }}>
          <span>Page {page + 1} of {TOTAL_PAGES}</span>
          <span>{totalAnswered} / {MBTI_ITEMS.length} answered</span>
        </div>
        <div style={{ height: 4, borderRadius: 2, background: 'var(--cap-border)', overflow: 'hidden' }}>
          <div style={{ height: '100%', borderRadius: 2, background: 'var(--cap-accent)', width: `${progress}%`, transition: 'width 300ms ease' }} />
        </div>
      </div>

      <p style={{ margin: 0, fontSize: 13, color: 'var(--cap-fg-2)' }}>
        For each pair, choose the phrase that describes you <em>more</em> accurately — even if neither is a perfect fit.
      </p>

      {/* Items */}
      {pageItems.map((item, idx) => {
        const sel = answers[item.id];
        return (
          <div key={item.id} style={{
            padding: '14px 0',
            borderBottom: idx < pageItems.length - 1 ? '1px solid var(--cap-border)' : 'none',
          }}>
            <div style={{ fontSize: 12, color: 'var(--cap-fg-2)', marginBottom: 10 }}>
              {page * PAGE_SIZE + idx + 1} of {MBTI_ITEMS.length}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 12, alignItems: 'center' }}>
              <ChoiceButton
                label={item.a}
                active={sel === 'a'}
                onClick={() => setAnswers((prev) => ({ ...prev, [item.id]: 'a' }))}
                align="right"
              />
              <span style={{ fontSize: 12, color: 'var(--cap-fg-2)', fontWeight: 600 }}>OR</span>
              <ChoiceButton
                label={item.b}
                active={sel === 'b'}
                onClick={() => setAnswers((prev) => ({ ...prev, [item.id]: 'b' }))}
                align="left"
              />
            </div>
          </div>
        );
      })}

      {/* Navigation */}
      <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 8 }}>
        <Button variant="secondary" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
          ← Previous
        </Button>
        {isLastPage ? (
          <Button variant="primary" disabled={!pageAnswered} onClick={finish}>
            Submit
          </Button>
        ) : (
          <Button variant="primary" disabled={!pageAnswered} onClick={() => setPage((p) => p + 1)}>
            Next →
          </Button>
        )}
      </div>
    </div>
  );
}

function ChoiceButton({ label, active, onClick, align }: {
  label: string; active: boolean; onClick: () => void; align: 'left' | 'right';
}) {
  return (
    <button
      onClick={onClick}
      style={{
        textAlign: align,
        padding: '12px 16px',
        fontSize: 14,
        color: active ? 'var(--cap-accent)' : 'var(--cap-fg-1)',
        background: active ? 'var(--cap-accent-muted)' : 'var(--cap-surface)',
        border: `2px solid ${active ? 'var(--cap-accent)' : 'var(--cap-border)'}`,
        borderRadius: 'var(--cap-radius-md)',
        cursor: 'pointer',
        fontFamily: 'var(--cap-font-sans)',
        fontWeight: active ? 600 : 400,
        transition: 'all 120ms ease',
        width: '100%',
      }}
    >
      {label}
    </button>
  );
}

function Status({ children, tone = 'default' }: { children: React.ReactNode; tone?: 'default' | 'danger' | 'success' }) {
  const color = tone === 'danger' ? 'var(--cap-danger)' : tone === 'success' ? 'var(--cap-success)' : 'var(--cap-fg-2)';
  return <div style={{ padding: 'var(--cap-space-5)', color, fontSize: 14 }}>{children}</div>;
}
