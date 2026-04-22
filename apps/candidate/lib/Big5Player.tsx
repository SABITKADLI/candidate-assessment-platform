'use client';

import { useState } from 'react';
import { Button } from '@cap/ui';
import { BIG5_ITEMS, LIKERT_LABELS, scoreBig5, type LikertValue } from './big5-items';

const PAGE_SIZE = 10; // items per page
const TOTAL_PAGES = Math.ceil(BIG5_ITEMS.length / PAGE_SIZE);

type Phase = 'questions' | 'submitting' | 'done' | 'error';

export function Big5Player() {
  const [answers, setAnswers] = useState<Record<string, LikertValue>>({});
  const [page, setPage] = useState(0);
  const [phase, setPhase] = useState<Phase>('questions');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const pageItems = BIG5_ITEMS.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const pageAnswered = pageItems.every((item) => answers[item.id] != null);
  const totalAnswered = Object.keys(answers).length;
  const progress = Math.round((totalAnswered / BIG5_ITEMS.length) * 100);
  const isLastPage = page === TOTAL_PAGES - 1;

  function answer(itemId: string, value: LikertValue) {
    setAnswers((prev) => ({ ...prev, [itemId]: value }));
  }

  async function finish() {
    if (!pageAnswered) return;
    setPhase('submitting');

    const scores = scoreBig5(answers);
    const res = await fetch('/api/stages/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({
        stage_key: 'A_BIG5',
        payload: { answers, scores },
        score: Math.round(Object.values(scores).reduce((a, b) => a + b, 0) / 5),
      }),
    });

    if (!res.ok) {
      const j = await res.json().catch(() => ({})) as { error?: string };
      setErrorMsg(j.error ?? `HTTP ${res.status}`);
      setPhase('error');
      return;
    }
    setPhase('done');
    const tokenPath = window.location.pathname.replace(/\/a_big5$/, '');
    window.location.href = tokenPath;
  }

  if (phase === 'done') {
    return <Status tone="success">Thank you. Continuing…</Status>;
  }
  if (phase === 'submitting') {
    return <Status>Saving your responses…</Status>;
  }
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
      {/* Progress bar */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 12, color: 'var(--cap-fg-2)' }}>
          <span>Page {page + 1} of {TOTAL_PAGES}</span>
          <span>{totalAnswered} / {BIG5_ITEMS.length} answered</span>
        </div>
        <div style={{ height: 4, borderRadius: 2, background: 'var(--cap-border)', overflow: 'hidden' }}>
          <div style={{ height: '100%', borderRadius: 2, background: 'var(--cap-accent)', width: `${progress}%`, transition: 'width 300ms ease' }} />
        </div>
      </div>

      {/* Likert header */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr repeat(5, 80px)',
        gap: 4,
        fontSize: 11,
        color: 'var(--cap-fg-2)',
        textAlign: 'center',
        paddingBottom: 8,
        borderBottom: '1px solid var(--cap-border)',
      }}>
        <span />
        {LIKERT_LABELS.map((l) => (
          <span key={l.value} style={{ lineHeight: 1.2 }}>{l.label}</span>
        ))}
      </div>

      {/* Items */}
      {pageItems.map((item, idx) => {
        const selected = answers[item.id];
        return (
          <div key={item.id} style={{
            display: 'grid',
            gridTemplateColumns: '1fr repeat(5, 80px)',
            gap: 4,
            alignItems: 'center',
            padding: '10px 0',
            borderBottom: idx < pageItems.length - 1 ? '1px solid var(--cap-border)' : 'none',
          }}>
            <span style={{ fontSize: 14, color: 'var(--cap-fg-1)', paddingRight: 12 }}>
              {item.text}
            </span>
            {LIKERT_LABELS.map((l) => {
              const active = selected === l.value;
              return (
                <div key={l.value} style={{ display: 'flex', justifyContent: 'center' }}>
                  <button
                    onClick={() => answer(item.id, l.value)}
                    aria-label={l.label}
                    style={{
                      width: 28, height: 28, borderRadius: '50%',
                      border: `2px solid ${active ? 'var(--cap-accent)' : 'var(--cap-border)'}`,
                      background: active ? 'var(--cap-accent)' : 'transparent',
                      cursor: 'pointer',
                      transition: 'background 120ms ease, border-color 120ms ease',
                    }}
                  />
                </div>
              );
            })}
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

function Status({ children, tone = 'default' }: { children: React.ReactNode; tone?: 'default' | 'danger' | 'success' }) {
  const color = tone === 'danger' ? 'var(--cap-danger)' : tone === 'success' ? 'var(--cap-success)' : 'var(--cap-fg-2)';
  return <div style={{ padding: 'var(--cap-space-5)', color, fontSize: 14 }}>{children}</div>;
}
