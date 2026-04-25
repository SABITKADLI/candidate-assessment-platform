'use client';

import { useState } from 'react';
import { Button, Input } from '@cap/ui';

type Stage = 'A' | 'B';
type FormState = 'idle' | 'submitting' | 'done' | 'error';

export function NewSessionForm() {
  const [email, setEmail] = useState('');
  const [stage, setStage] = useState<Stage>('A');
  const [expiryHours, setExpiryHours] = useState(48);
  const [formState, setFormState] = useState<FormState>('idle');
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setFormState('submitting');
    setErrorMsg(null);

    const res = await fetch('/api/sessions/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ email, stage, expiry_hours: expiryHours }),
    });

    if (!res.ok) {
      const j = await res.json().catch(() => ({})) as { error?: string };
      setErrorMsg(j.error ?? `HTTP ${res.status}`);
      setFormState('error');
      return;
    }

    const { invite_url } = await res.json() as { invite_url: string };
    setInviteUrl(invite_url);
    setFormState('done');
  }

  function copyLink() {
    if (!inviteUrl) return;
    void navigator.clipboard.writeText(inviteUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function reset() {
    setEmail('');
    setStage('A');
    setExpiryHours(48);
    setFormState('idle');
    setInviteUrl(null);
    setErrorMsg(null);
    setCopied(false);
  }

  if (formState === 'done' && inviteUrl) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--cap-fg-2)' }}>
          Session created. Share this link with the candidate:
        </p>
        <div style={{
          display: 'flex', gap: 8, alignItems: 'center',
          background: 'var(--cap-surface)', border: '1px solid var(--cap-border)',
          borderRadius: 'var(--cap-radius-md)', padding: '10px 12px',
        }}>
          <span style={{
            flex: 1, fontFamily: 'var(--cap-font-mono)', fontSize: 12,
            color: 'var(--cap-fg-1)', wordBreak: 'break-all',
          }}>{inviteUrl}</span>
          <Button variant="secondary" size="sm" onClick={copyLink}>
            {copied ? 'Copied!' : 'Copy'}
          </Button>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Button variant="secondary" onClick={reset}>Create another</Button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={(e) => { void submit(e); }} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <Input
        label="Candidate email"
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="candidate@example.com"
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--cap-fg-2)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
          Stage group
        </span>
        <div style={{ display: 'flex', gap: 8 }}>
          {(['A', 'B'] as const).map((s) => (
            <label key={s} style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 14px', cursor: 'pointer',
              border: `1px solid ${stage === s ? 'var(--cap-accent)' : 'var(--cap-border)'}`,
              borderRadius: 'var(--cap-radius-md)',
              background: stage === s ? 'var(--cap-accent-surface)' : 'var(--cap-surface)',
              fontSize: 13, color: stage === s ? 'var(--cap-fg-1)' : 'var(--cap-fg-2)',
            }}>
              <input
                type="radio"
                name="stage"
                value={s}
                checked={stage === s}
                onChange={() => setStage(s)}
                style={{ accentColor: 'var(--cap-accent)' }}
              />
              Stage {s} {s === 'A' ? '(Screening)' : '(Technical)'}
            </label>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        <label style={{ fontSize: 11, fontWeight: 500, color: 'var(--cap-fg-2)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
          Link expires in
        </label>
        <select
          value={expiryHours}
          onChange={(e) => setExpiryHours(Number(e.target.value))}
          style={{
            background: 'var(--cap-surface)', border: '1px solid var(--cap-border)',
            borderRadius: 'var(--cap-radius-md)', padding: '8px 10px',
            color: 'var(--cap-fg-1)', fontSize: 13, cursor: 'pointer',
          }}
        >
          <option value={24}>24 hours</option>
          <option value={48}>48 hours</option>
          <option value={72}>72 hours</option>
          <option value={168}>7 days</option>
        </select>
      </div>

      {formState === 'error' && errorMsg && (
        <p style={{ margin: 0, fontSize: 13, color: 'var(--cap-danger)' }}>{errorMsg}</p>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Button variant="primary" type="submit" disabled={formState === 'submitting'}>
          {formState === 'submitting' ? 'Creating…' : 'Create session'}
        </Button>
      </div>
    </form>
  );
}
