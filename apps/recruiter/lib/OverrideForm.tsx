'use client';

import { useState } from 'react';
import { Button, Input, Textarea } from '@cap/ui';

export function OverrideForm({ attemptId, currentScore }: { attemptId: string; currentScore: number | null }) {
  const [score, setScore] = useState(currentScore?.toFixed(1) ?? '');
  const [reason, setReason] = useState('');
  const [status, setStatus] = useState<'idle' | 'saving' | 'done' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setStatus('saving');
    setError(null);
    const numeric = Number(score);
    const res = await fetch(`/api/grading/${attemptId}/override`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ score: numeric, reason }),
    });
    const payload = await res.json().catch(() => ({})) as { error?: string };
    if (!res.ok) {
      setError(payload.error ?? `HTTP ${res.status}`);
      setStatus('error');
      return;
    }
    setStatus('done');
    setTimeout(() => window.location.reload(), 900);
  }

  return (
    <form onSubmit={(e) => { void submit(e); }} style={{ display: 'grid', gap: 10 }}>
      <Input
        label="Override score"
        type="number"
        min={0}
        max={100}
        step="0.1"
        value={score}
        onChange={(event) => setScore(event.target.value)}
        required
      />
      <Textarea
        label="Reason"
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        minLength={8}
        maxLength={2000}
        required
        rows={3}
      />
      {error && <p style={{ margin: 0, color: 'var(--cap-danger)', fontSize: 12 }}>{error}</p>}
      <Button variant="secondary" size="sm" type="submit" disabled={status === 'saving' || status === 'done'}>
        {status === 'saving' ? 'Saving...' : status === 'done' ? 'Saved' : 'Apply override'}
      </Button>
    </form>
  );
}
