'use client';

import { useState } from 'react';
import { Button } from '@cap/ui';
import { SJT_SCENARIOS, scoreSjt, type SjtOptionKey } from './sjt-items';

type Phase = 'questions' | 'submitting' | 'done' | 'error';

export function SjtPlayer() {
  const [answers, setAnswers] = useState<Record<string, SjtOptionKey>>({});
  const [scenarioIdx, setScenarioIdx] = useState(0);
  const [phase, setPhase] = useState<Phase>('questions');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const scenario = SJT_SCENARIOS[scenarioIdx]!;
  const totalAnswered = Object.keys(answers).length;
  const currentAnswer = answers[scenario.id];
  const isLast = scenarioIdx === SJT_SCENARIOS.length - 1;
  const progress = Math.round((scenarioIdx / SJT_SCENARIOS.length) * 100);

  async function finish(finalAnswers: Record<string, SjtOptionKey>) {
    setPhase('submitting');
    const score = scoreSjt(finalAnswers);
    const res = await fetch('/api/stages/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ stage_key: 'A_SJT', payload: { answers: finalAnswers }, score }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({})) as { error?: string };
      setErrorMsg(j.error ?? `HTTP ${res.status}`);
      setPhase('error');
      return;
    }
    setPhase('done');
    const tokenPath = window.location.pathname.replace(/\/a_sjt$/, '');
    window.location.href = tokenPath;
  }

  function next(choice: SjtOptionKey) {
    const newAnswers = { ...answers, [scenario.id]: choice };
    setAnswers(newAnswers);
    if (isLast) {
      void finish(newAnswers);
    } else {
      setScenarioIdx((i) => i + 1);
    }
  }

  if (phase === 'done') return <Status tone="success">Thank you. Continuing…</Status>;
  if (phase === 'submitting') return <Status>Saving responses…</Status>;
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
          <span>Scenario {scenarioIdx + 1} of {SJT_SCENARIOS.length}</span>
          <span>{totalAnswered} answered</span>
        </div>
        <div style={{ height: 4, borderRadius: 2, background: 'var(--cap-border)', overflow: 'hidden' }}>
          <div style={{ height: '100%', borderRadius: 2, background: 'var(--cap-accent)', width: `${progress}%`, transition: 'width 300ms ease' }} />
        </div>
      </div>

      {/* Situation */}
      <div style={{
        padding: '16px 18px',
        background: 'var(--cap-surface-2, rgba(255,255,255,0.04))',
        border: '1px solid var(--cap-border)',
        borderRadius: 'var(--cap-radius-md)',
        fontSize: 14, lineHeight: 1.7, color: 'var(--cap-fg-1)',
      }}>
        <p style={{ margin: '0 0 4px', fontSize: 11, fontWeight: 600, color: 'var(--cap-fg-2)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Situation
        </p>
        {scenario.situation}
      </div>

      <p style={{ margin: 0, fontSize: 13, color: 'var(--cap-fg-2)' }}>
        Which response would you be <strong>most likely</strong> to take?
      </p>

      {/* Options */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {scenario.options.map((opt) => {
          const active = currentAnswer === opt.key;
          return (
            <button
              key={opt.key}
              onClick={() => setAnswers((prev) => ({ ...prev, [scenario.id]: opt.key }))}
              style={{
                textAlign: 'left', padding: '14px 16px', fontSize: 14,
                color: 'var(--cap-fg-1)',
                background: active ? 'var(--cap-accent-muted)' : 'var(--cap-surface)',
                border: `2px solid ${active ? 'var(--cap-accent)' : 'var(--cap-border)'}`,
                borderRadius: 'var(--cap-radius-md)',
                cursor: 'pointer', fontFamily: 'var(--cap-font-sans)',
                transition: 'all 120ms ease', lineHeight: 1.6,
              }}
            >
              <span style={{
                display: 'inline-block', width: 22, textAlign: 'center', marginRight: 10,
                fontFamily: 'var(--cap-font-mono)', fontWeight: 600,
                color: active ? 'var(--cap-accent)' : 'var(--cap-fg-2)',
              }}>
                {opt.key}
              </span>
              {opt.text}
            </button>
          );
        })}
      </div>

      {/* Navigation */}
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <Button
          variant="secondary"
          disabled={scenarioIdx === 0}
          onClick={() => setScenarioIdx((i) => i - 1)}
        >
          ← Previous
        </Button>
        <Button
          variant="primary"
          disabled={!currentAnswer}
          onClick={() => { if (currentAnswer) next(currentAnswer); }}
        >
          {isLast ? 'Submit' : 'Next →'}
        </Button>
      </div>
    </div>
  );
}

function Status({ children, tone = 'default' }: { children: React.ReactNode; tone?: 'default' | 'danger' | 'success' }) {
  const color = tone === 'danger' ? 'var(--cap-danger)' : tone === 'success' ? 'var(--cap-success)' : 'var(--cap-fg-2)';
  return <div style={{ padding: 'var(--cap-space-5)', color, fontSize: 14 }}>{children}</div>;
}
