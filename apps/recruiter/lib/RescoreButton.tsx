'use client';

import { useState } from 'react';
import { Button } from '@cap/ui';

type Status = 'idle' | 'running' | 'done' | 'error';

const RECO_COLOR: Record<string, string> = {
  advance: 'var(--cap-success)',
  hold:    'var(--cap-warning)',
  decline: 'var(--cap-danger)',
  unknown: 'var(--cap-fg-3)',
};

export function RescoreButton({ sessionId }: { sessionId: string }) {
  const [confirming, setConfirming] = useState(false);
  const [status, setStatus]         = useState<Status>('idle');
  const [result, setResult]         = useState<{ composite: number; recommendation: string } | null>(null);
  const [error, setError]           = useState<string | null>(null);

  async function run() {
    setConfirming(false);
    setStatus('running');
    setResult(null);
    setError(null);
    try {
      const res = await fetch(`/api/sessions/${sessionId}/rescore`, {
        method: 'POST',
        credentials: 'same-origin',
      });
      const json = await res.json() as { ok?: boolean; error?: string; composite?: number | null; recommendation?: string };
      if (!res.ok || json.error) {
        setError(json.error ?? `HTTP ${res.status}`);
        setStatus('error');
        return;
      }
      setResult({ composite: json.composite ?? 0, recommendation: json.recommendation ?? 'queued' });
      setStatus('done');
      setTimeout(() => window.location.reload(), 1400);
    } catch (e) {
      setError(String(e));
      setStatus('error');
    }
  }

  return (
    <>
      {/* Confirm modal */}
      {confirming && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="rescore-dialog-title"
          style={{
            position: 'fixed', inset: 0, zIndex: 500,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 24,
          }}
        >
          {/* Backdrop */}
          <div
            aria-hidden="true"
            onClick={() => setConfirming(false)}
            style={{
              position: 'absolute', inset: 0,
              background: 'rgba(0,0,0,0.55)',
              backdropFilter: 'blur(3px)',
              WebkitBackdropFilter: 'blur(3px)',
            }}
          />

          {/* Dialog box */}
          <div style={{
            position: 'relative', zIndex: 1,
            background: 'var(--cap-surface)',
            border: '1px solid var(--cap-border-2)',
            borderRadius: 'var(--cap-radius-lg)',
            boxShadow: 'var(--cap-shadow-lg)',
            width: '100%',
            maxWidth: 400,
            padding: '28px 28px 24px',
            display: 'flex',
            flexDirection: 'column',
            gap: 20,
            animation: 'cap-scale-in 0.15s cubic-bezier(0.16,1,0.3,1) both',
          }}>
            {/* Icon + title */}
            <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
              <div style={{
                width: 40, height: 40, flexShrink: 0,
                borderRadius: 10,
                background: 'var(--cap-accent-surface)',
                border: '1px solid var(--cap-accent-hover)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
                  stroke="var(--cap-accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                  aria-hidden>
                  <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
                </svg>
              </div>
              <div>
                <h2 id="rescore-dialog-title" style={{
                  margin: '0 0 4px',
                  fontSize: 15, fontWeight: 600,
                  color: 'var(--cap-fg-1)',
                  letterSpacing: '-0.01em',
                }}>
                  Rescore this session?
                </h2>
                <p style={{ margin: 0, fontSize: 13, color: 'var(--cap-fg-2)', lineHeight: 1.6 }}>
                  This will recompute the composite score from all stage attempts and generate a new Claude memo.
                  The existing score and memo will be overwritten.
                </p>
              </div>
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <Button variant="secondary" size="md" onClick={() => setConfirming(false)}>
                Cancel
              </Button>
              <Button variant="primary" size="md" onClick={() => void run()}>
                Yes, rescore
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Trigger + feedback */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
        <Button
          variant="secondary"
          size="sm"
          disabled={status === 'running' || status === 'done'}
          onClick={() => setConfirming(true)}
        >
          {status === 'running' ? 'Scoring…' : status === 'done' ? 'Done ✓' : 'Rescore'}
        </Button>

        {status === 'done' && result && (
          <div style={{
            fontSize: 11,
            fontFamily: 'var(--cap-font-mono)',
            color: RECO_COLOR[result.recommendation] ?? 'var(--cap-fg-2)',
            whiteSpace: 'nowrap',
          }}>
            {result.composite.toFixed(1)} · {result.recommendation}
          </div>
        )}

        {status === 'error' && error && (
          <div style={{
            fontSize: 11, color: 'var(--cap-danger)',
            maxWidth: 220, textAlign: 'right', lineHeight: 1.4,
          }}>
            {error}
          </div>
        )}
      </div>
    </>
  );
}
