'use client';

import { useState } from 'react';
import { Button } from '@cap/ui';
import { Send } from 'lucide-react';

type Status = 'idle' | 'running' | 'done' | 'error';

export function ResendEmailButton({ sessionId }: { sessionId: string }) {
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError]   = useState<string | null>(null);

  async function run() {
    setStatus('running');
    setError(null);
    try {
      const res = await fetch(`/api/sessions/${sessionId}/resend-email`, {
        method: 'POST',
        credentials: 'same-origin',
      });
      const json = await res.json() as { ok?: boolean; error?: string };
      if (!res.ok || json.error) {
        setError(json.error ?? `HTTP ${res.status}`);
        setStatus('error');
        return;
      }
      setStatus('done');
      setTimeout(() => window.location.reload(), 1400);
    } catch (e) {
      setError(String(e));
      setStatus('error');
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
      <Button
        variant="secondary"
        size="sm"
        disabled={status === 'running' || status === 'done'}
        onClick={() => void run()}
      >
        <Send size={12} strokeWidth={2} aria-hidden />
        {status === 'running' ? 'Sending…' : status === 'done' ? 'Sent ✓' : 'Resend invite'}
      </Button>

      {status === 'error' && error && (
        <div style={{
          fontSize: 11, color: 'var(--cap-danger)',
          maxWidth: 220, textAlign: 'right', lineHeight: 1.4,
        }}>
          {error}
        </div>
      )}
    </div>
  );
}
