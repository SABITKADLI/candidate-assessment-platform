'use client';

import { useEffect, useState } from 'react';
import { Button } from '@cap/ui';

// 10 canonical Rorschach cards represented as SVG gradient blobs.
// Real plates are proprietary; these are procedurally generated symmetric shapes
// for dev/legal-safe use. In production, replace src with licensed plate scans.
const CARDS = [
  { id: 'R01', label: 'Card I',   hue: 220 },
  { id: 'R02', label: 'Card II',  hue: 0   },
  { id: 'R03', label: 'Card III', hue: 0   },
  { id: 'R04', label: 'Card IV',  hue: 220 },
  { id: 'R05', label: 'Card V',   hue: 220 },
  { id: 'R06', label: 'Card VI',  hue: 220 },
  { id: 'R07', label: 'Card VII', hue: 220 },
  { id: 'R08', label: 'Card VIII',hue: 200 },
  { id: 'R09', label: 'Card IX',  hue: 120 },
  { id: 'R10', label: 'Card X',   hue: 200 },
];

const MIN_CHARS = 20;
const DISPLAY_SECONDS = 30;

type Phase = 'viewing' | 'responding' | 'submitting' | 'done' | 'error';

export function RorschachPlayer() {
  const [cardIdx, setCardIdx] = useState(0);
  const [phase, setPhase] = useState<Phase>('viewing');
  const [responses, setResponses] = useState<Record<string, string>>({});
  const [currentText, setCurrentText] = useState('');
  const [timer, setTimer] = useState(DISPLAY_SECONDS);
  const [timerActive, setTimerActive] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const card = CARDS[cardIdx]!;
  const isLastCard = cardIdx === CARDS.length - 1;

  function startViewing() {
    setPhase('viewing');
    setTimer(DISPLAY_SECONDS);
    setTimerActive(true);
    const start = Date.now();
    const id = window.setInterval(() => {
      const remaining = Math.max(0, DISPLAY_SECONDS - Math.floor((Date.now() - start) / 1000));
      setTimer(remaining);
      if (remaining === 0) {
        window.clearInterval(id);
        setTimerActive(false);
        setPhase('responding');
      }
    }, 500);
  }

  function proceedToResponse() {
    setTimerActive(false);
    setPhase('responding');
  }

  function saveAndNext() {
    const trimmed = currentText.trim();
    if (trimmed.length < MIN_CHARS) return;
    setResponses((prev) => ({ ...prev, [card.id]: trimmed }));
    setCurrentText('');

    if (!isLastCard) {
      setCardIdx((i) => i + 1);
      setPhase('viewing');
      setTimer(DISPLAY_SECONDS);
    } else {
      void submit({ ...responses, [card.id]: trimmed });
    }
  }

  async function submit(finalResponses: Record<string, string>) {
    setPhase('submitting');
    // Richness proxy: average word-count score per card (40 words = 100).
    const vals = Object.values(finalResponses);
    const richnessScore = vals.length > 0
      ? Math.round(vals.reduce((sum, text) => {
          const words = text.trim().split(/\s+/).filter(Boolean).length;
          return sum + Math.min((words / 40) * 100, 100);
        }, 0) / vals.length)
      : 0;
    const res = await fetch('/api/stages/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({
        stage_key: 'A_RORSCHACH',
        payload: { responses: finalResponses },
        score: richnessScore,
      }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({})) as { error?: string };
      setErrorMsg(j.error ?? `HTTP ${res.status}`);
      setPhase('error');
      return;
    }
    setPhase('done');
    const tokenPath = window.location.pathname.replace(/\/a_rorschach$/, '');
    window.location.href = tokenPath;
  }

  if (phase === 'done') return <Status tone="success">Thank you. Continuing…</Status>;
  if (phase === 'submitting') return <Status>Saving responses…</Status>;
  if (phase === 'error') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Status tone="danger">{errorMsg}</Status>
        <Button variant="secondary" onClick={() => setPhase('responding')}>Retry</Button>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Progress */}
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--cap-fg-2)' }}>
        <span>{card.label}</span>
        <span>{cardIdx + 1} / {CARDS.length}</span>
      </div>
      <div style={{ height: 4, borderRadius: 2, background: 'var(--cap-border)', overflow: 'hidden' }}>
        <div style={{ height: '100%', borderRadius: 2, background: 'var(--cap-accent)', width: `${((cardIdx) / CARDS.length) * 100}%` }} />
      </div>

      {/* Inkblot placeholder */}
      <div style={{
        width: '100%', aspectRatio: '4/3',
        background: `radial-gradient(ellipse at 50% 40%, hsl(${card.hue},15%,25%) 0%, hsl(${card.hue},8%,12%) 60%, hsl(${card.hue},5%,8%) 100%)`,
        borderRadius: 'var(--cap-radius-lg)',
        border: '1px solid var(--cap-border)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexDirection: 'column', gap: 8,
        position: 'relative', overflow: 'hidden',
      }}>
        {/* Symmetric blob shape */}
        <InkBlob seed={cardIdx} hue={card.hue} />
        {phase === 'viewing' && (
          <div style={{
            position: 'absolute', bottom: 12, right: 16,
            fontFamily: 'var(--cap-font-mono)', fontSize: 13,
            color: 'rgba(255,255,255,0.5)',
          }}>
            {timer}s
          </div>
        )}
      </div>

      {phase === 'viewing' && (
        <>
          <p style={{ margin: 0, fontSize: 14, color: 'var(--cap-fg-2)' }}>
            Look at this image carefully. You will be asked to describe what you see.
          </p>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Button variant="secondary" onClick={proceedToResponse}>
              {timerActive ? `Skip wait (${timer}s)` : 'Continue →'}
            </Button>
          </div>
        </>
      )}

      {phase === 'responding' && (
        <>
          <p style={{ margin: 0, fontSize: 14, color: 'var(--cap-fg-2)' }}>
            What might this be? Describe everything you see — there are no right or wrong answers.
          </p>
          <textarea
            value={currentText}
            onChange={(e) => setCurrentText(e.target.value)}
            rows={4}
            placeholder="Describe what you see…"
            style={{
              width: '100%', boxSizing: 'border-box',
              padding: '10px 12px', fontSize: 14,
              background: 'var(--cap-surface)', color: 'var(--cap-fg-1)',
              border: `1px solid var(--cap-border)`,
              borderRadius: 'var(--cap-radius-md)',
              fontFamily: 'var(--cap-font-sans)', resize: 'vertical',
              outline: 'none',
            }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: currentText.trim().length < MIN_CHARS ? 'var(--cap-danger)' : 'var(--cap-fg-2)' }}>
              {currentText.trim().length} / {MIN_CHARS} characters minimum
            </span>
            <Button
              variant="primary"
              disabled={currentText.trim().length < MIN_CHARS}
              onClick={saveAndNext}
            >
              {isLastCard ? 'Submit' : 'Next card →'}
            </Button>
          </div>
        </>
      )}

      {/* Start viewing — first card shows a Begin button; subsequent cards auto-start */}
      {phase === 'viewing' && !timerActive && cardIdx === 0 && (
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <Button variant="primary" onClick={startViewing}>Begin</Button>
        </div>
      )}
      {phase === 'viewing' && !timerActive && cardIdx > 0 && (
        <AutoStart onMount={startViewing} />
      )}
    </div>
  );
}

function AutoStart({ onMount }: { onMount: () => void }) {
  useEffect(() => { onMount(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

function InkBlob({ seed, hue }: { seed: number; hue: number }) {
  // Deterministic symmetric blob from seed.
  const pts = Array.from({ length: 6 }, (_, i) => {
    const r = 60 + ((seed * 17 + i * 31) % 40);
    const a = (i / 6) * Math.PI; // upper half only; mirrored
    return { x: 200 + r * Math.cos(a), y: 150 - r * Math.sin(a) };
  });
  const mirror = [...pts].reverse().map((p) => ({ x: p.x, y: 300 - p.y }));
  const all = [...pts, ...mirror];
  const d = all.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ') + ' Z';

  return (
    <svg viewBox="0 0 400 300" width="70%" height="70%" style={{ opacity: 0.85 }}>
      <path d={d} fill={`hsl(${hue},10%,45%)`} />
    </svg>
  );
}

function Status({ children, tone = 'default' }: { children: React.ReactNode; tone?: 'default' | 'danger' | 'success' }) {
  const color = tone === 'danger' ? 'var(--cap-danger)' : tone === 'success' ? 'var(--cap-success)' : 'var(--cap-fg-2)';
  return <div style={{ padding: 'var(--cap-space-5)', color, fontSize: 14 }}>{children}</div>;
}
