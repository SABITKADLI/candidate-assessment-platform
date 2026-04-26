'use client';

import { useState } from 'react';
import { Button } from '@cap/ui';

export function RetryButton({ id }: { id: string }) {
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');

  async function retry() {
    setState('loading');
    const res = await fetch('/api/outbox/retry', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ id }),
    });
    if (res.ok) {
      setState('done');
      setTimeout(() => window.location.reload(), 800);
    } else {
      setState('error');
      setTimeout(() => setState('idle'), 3000);
    }
  }

  return (
    <Button
      variant="secondary"
      size="sm"
      disabled={state === 'loading' || state === 'done'}
      onClick={() => { void retry(); }}
    >
      {state === 'loading' ? 'Retrying…' : state === 'done' ? 'Queued' : state === 'error' ? 'Error' : 'Retry'}
    </Button>
  );
}
