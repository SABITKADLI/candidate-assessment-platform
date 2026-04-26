'use client';

import { useState } from 'react';
import { Button } from '@cap/ui';

type Status = 'idle' | 'running' | 'done' | 'error';

interface Result {
  composite: number;
  recommendation: string;
  markdown: string;
}

const RECO_COLOR: Record<string, string> = {
  advance: 'var(--cap-success)',
  hold:    'var(--cap-warning)',
  decline: 'var(--cap-danger)',
  unknown: 'var(--cap-fg-3)',
};

export function RescorePanel() {
  const [sessionId, setSessionId] = useState('');
  const [status, setStatus]       = useState<Status>('idle');
  const [result, setResult]       = useState<Result | null>(null);
  const [error, setError]         = useState<string | null>(null);

  const valid = /^[0-9a-f-]{36}$/i.test(sessionId.trim());

  async function run() {
    if (!valid) return;
    setStatus('running');
    setResult(null);
    setError(null);
    try {
      const res = await fetch(`/api/sessions/${sessionId.trim()}/rescore`, {
        method: 'POST',
        credentials: 'same-origin',
      });
      const json = await res.json() as { ok?: boolean; error?: string } & Partial<Result>;
      if (!res.ok || json.error) {
        setError(json.error ?? `HTTP ${res.status}`);
        setStatus('error');
        return;
      }
      setResult({ composite: json.composite!, recommendation: json.recommendation!, markdown: json.markdown! });
      setStatus('done');
    } catch (e) {
      setError(String(e));
      setStatus('error');
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Input row */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
        <div style={{ flex: 1 }}>
          <input
            type="text"
            value={sessionId}
            onChange={(e) => { setSessionId(e.target.value); setStatus('idle'); setResult(null); setError(null); }}
            placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
            spellCheck={false}
            style={{
              width: '100%',
              padding: '8px 10px',
              fontFamily: 'var(--cap-font-mono)',
              fontSize: 12,
              background: 'var(--cap-surface)',
              border: '1px solid var(--cap-border)',
              borderRadius: 'var(--cap-radius-md)',
              color: 'var(--cap-fg-1)',
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />
          {sessionId && !valid && (
            <p style={{ margin: '4px 0 0', fontSize: 11, color: 'var(--cap-danger)' }}>
              Must be a valid UUID
            </p>
          )}
        </div>
        <Button
          variant="primary"
          size="md"
          disabled={!valid || status === 'running'}
          onClick={() => void run()}
        >
          {status === 'running' ? 'Running…' : 'Run memo'}
        </Button>
      </div>

      {/* Error */}
      {status === 'error' && error && (
        <div style={{
          padding: '12px 14px',
          background: 'var(--cap-danger-muted)',
          border: '1px solid var(--cap-danger-border)',
          borderRadius: 'var(--cap-radius-md)',
          fontSize: 13,
          color: 'var(--cap-danger)',
          fontFamily: 'var(--cap-font-mono)',
        }}>
          {error}
        </div>
      )}

      {/* Result */}
      {status === 'done' && result && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Summary strip */}
          <div style={{
            display: 'flex', gap: 24, alignItems: 'center',
            padding: '12px 16px',
            background: 'var(--cap-surface-2)',
            borderRadius: 'var(--cap-radius-md)',
            border: '1px solid var(--cap-border)',
            flexWrap: 'wrap',
          }}>
            <div>
              <div style={{ fontSize: 10, color: 'var(--cap-fg-3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 2 }}>Composite</div>
              <div style={{ fontFamily: 'var(--cap-font-mono)', fontSize: 22, fontWeight: 700, color: 'var(--cap-fg-1)' }}>
                {result.composite.toFixed(1)}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 10, color: 'var(--cap-fg-3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 2 }}>Recommendation</div>
              <div style={{
                fontFamily: 'var(--cap-font-mono)', fontSize: 13, fontWeight: 600,
                color: RECO_COLOR[result.recommendation] ?? 'var(--cap-fg-1)',
                textTransform: 'capitalize',
              }}>
                {result.recommendation}
              </div>
            </div>
          </div>

          {/* Memo markdown */}
          <div style={{
            padding: '16px 18px',
            background: 'var(--cap-surface)',
            border: '1px solid var(--cap-border)',
            borderRadius: 'var(--cap-radius-md)',
            maxHeight: 400,
            overflowY: 'auto',
          }}>
            <pre style={{
              margin: 0,
              fontFamily: 'var(--cap-font-sans)',
              fontSize: 12,
              color: 'var(--cap-fg-1)',
              lineHeight: 1.75,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}>
              {result.markdown}
            </pre>
          </div>

          <p style={{ margin: 0, fontSize: 11, color: 'var(--cap-fg-3)' }}>
            Memo saved — refresh the session detail page to see it.
          </p>
        </div>
      )}
    </div>
  );
}
