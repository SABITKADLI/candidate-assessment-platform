'use client';

import { useEffect, useState } from 'react';
import { Button } from '@cap/ui';

const CARDS = [
  { id: 'R01', label: 'Card I',    src: '/rorschach/card_01.jpg' },
  { id: 'R02', label: 'Card II',   src: '/rorschach/card_02.jpg' },
  { id: 'R03', label: 'Card III',  src: '/rorschach/card_03.jpg' },
  { id: 'R04', label: 'Card IV',   src: '/rorschach/card_04.jpg' },
  { id: 'R05', label: 'Card V',    src: '/rorschach/card_05.jpg' },
  { id: 'R06', label: 'Card VI',   src: '/rorschach/card_06.jpg' },
  { id: 'R07', label: 'Card VII',  src: '/rorschach/card_07.jpg' },
  { id: 'R08', label: 'Card VIII', src: '/rorschach/card_08.jpg' },
  { id: 'R09', label: 'Card IX',   src: '/rorschach/card_09.jpg' },
  { id: 'R10', label: 'Card X',    src: '/rorschach/card_10.jpg' },
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
    const res = await fetch('/api/stages/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({
        stage_key: 'A_RORSCHACH',
        payload: { responses: finalResponses },
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

      {/* Inkblot image — fixed 480×360 display area, image fills via object-fit */}
      <div style={{
        width: '100%',
        maxWidth: 480,
        margin: '0 auto',
        aspectRatio: '4/3',
        background: '#fff',
        borderRadius: 'var(--cap-radius-lg)',
        border: '1px solid var(--cap-border)',
        overflow: 'hidden',
        position: 'relative',
        boxShadow: 'var(--cap-shadow-md)',
      }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          key={card.src}
          src={card.src}
          alt={`Rorschach inkblot ${card.label}`}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'contain',
            objectPosition: 'center',
            display: 'block',
          }}
          draggable={false}
        />
        {phase === 'viewing' && (
          <div style={{
            position: 'absolute', bottom: 10, right: 14,
            fontFamily: 'var(--cap-font-mono)', fontSize: 12,
            color: 'rgba(0,0,0,0.4)',
            background: 'rgba(255,255,255,0.7)',
            padding: '2px 6px',
            borderRadius: 4,
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


function Status({ children, tone = 'default' }: { children: React.ReactNode; tone?: 'default' | 'danger' | 'success' }) {
  const color = tone === 'danger' ? 'var(--cap-danger)' : tone === 'success' ? 'var(--cap-success)' : 'var(--cap-fg-2)';
  return <div style={{ padding: 'var(--cap-space-5)', color, fontSize: 14 }}>{children}</div>;
}
