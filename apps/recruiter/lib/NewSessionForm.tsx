'use client';

import { useState, useEffect } from 'react';
import { Button, Input } from '@cap/ui';

type Stage = 'A' | 'B' | 'AB';
type FormState = 'idle' | 'submitting' | 'done' | 'error';

type RoleOption = { id: string; name: string };

const STAGE_OPTIONS: { value: Stage; label: string; sub: string }[] = [
  { value: 'A',  label: 'Stage A',        sub: 'Screening only'          },
  { value: 'B',  label: 'Stage B',        sub: 'Technical only'          },
  { value: 'AB', label: 'Full pipeline',  sub: 'A → B auto-chained'      },
];

export function NewSessionForm() {
  const [email, setEmail]             = useState('');
  const [stage, setStage]             = useState<Stage>('AB');
  const [roleId, setRoleId]           = useState<string>('');
  const [roles, setRoles]             = useState<RoleOption[]>([]);
  const [expiryHours, setExpiryHours] = useState(48);
  const [formState, setFormState]     = useState<FormState>('idle');
  const [inviteUrl, setInviteUrl]     = useState<string | null>(null);
  const [isPipeline, setIsPipeline]   = useState(false);
  const [emailQueued, setEmailQueued] = useState(false);
  const [errorMsg, setErrorMsg]       = useState<string | null>(null);
  const [copied, setCopied]           = useState(false);

  useEffect(() => {
    fetch('/api/roles', { credentials: 'same-origin' })
      .then((r) => r.ok ? r.json() : { roles: [] })
      .then((d: { roles?: RoleOption[] }) => setRoles(d.roles ?? []))
      .catch(() => {/* non-critical */});
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setFormState('submitting');
    setErrorMsg(null);

    const res = await fetch('/api/sessions/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({
        email,
        stage,
        expiry_hours: expiryHours,
        ...(roleId ? { role_id: roleId } : {}),
      }),
    });

    if (!res.ok) {
      const j = await res.json().catch(() => ({})) as { error?: string };
      setErrorMsg(j.error ?? `HTTP ${res.status}`);
      setFormState('error');
      return;
    }

    const data = await res.json() as { invite_url: string; pipeline: boolean; email_queued: boolean };
    setInviteUrl(data.invite_url);
    setIsPipeline(data.pipeline);
    setEmailQueued(data.email_queued ?? false);
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
    setStage('AB');
    setRoleId('');
    setExpiryHours(48);
    setFormState('idle');
    setInviteUrl(null);
    setIsPipeline(false);
    setEmailQueued(false);
    setErrorMsg(null);
    setCopied(false);
  }

  if (formState === 'done' && inviteUrl) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {emailQueued ? (
          <p style={{ margin: 0, fontSize: 13, color: 'var(--cap-success)' }}>
            Invite email sent to <strong>{email}</strong>.
            {isPipeline && ' The candidate will automatically continue to Stage B after completing Stage A.'}
          </p>
        ) : (
          <p style={{ margin: 0, fontSize: 13, color: 'var(--cap-fg-2)' }}>
            {isPipeline
              ? 'Pipeline created. Share the Stage A link — the candidate will automatically continue to Stage B after completing it.'
              : 'Session created. Share this link with the candidate:'}
          </p>
        )}
        <div style={{
          display: 'flex', gap: 8, alignItems: 'center',
          background: 'var(--cap-surface-2)', border: '1px solid var(--cap-border)',
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
        {isPipeline && (
          <p style={{
            margin: 0, fontSize: 12, color: 'var(--cap-fg-3)',
            fontFamily: 'var(--cap-font-mono)',
          }}>
            Stage B is pre-created and will be offered automatically on the completion screen.
          </p>
        )}
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

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--cap-fg-2)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
          Stage
        </span>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {STAGE_OPTIONS.map((opt) => (
            <label key={opt.value} style={{
              display: 'flex', flexDirection: 'column', gap: 2,
              padding: '10px 14px', cursor: 'pointer', flex: 1, minWidth: 100,
              border: `1px solid ${stage === opt.value ? 'var(--cap-accent)' : 'var(--cap-border)'}`,
              borderRadius: 'var(--cap-radius-md)',
              background: stage === opt.value ? 'var(--cap-accent-surface)' : 'var(--cap-surface)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input
                  type="radio"
                  name="stage"
                  value={opt.value}
                  checked={stage === opt.value}
                  onChange={() => setStage(opt.value)}
                  style={{ accentColor: 'var(--cap-accent)' }}
                />
                <span style={{ fontSize: 13, fontWeight: 500, color: stage === opt.value ? 'var(--cap-fg-1)' : 'var(--cap-fg-2)' }}>
                  {opt.label}
                </span>
              </div>
              <span style={{ fontSize: 11, color: 'var(--cap-fg-3)', paddingLeft: 18 }}>
                {opt.sub}
              </span>
            </label>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        <label style={{ fontSize: 11, fontWeight: 500, color: 'var(--cap-fg-2)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
          Role <span style={{ color: 'var(--cap-fg-3)', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(optional)</span>
        </label>
        <select
          value={roleId}
          onChange={(e) => setRoleId(e.target.value)}
          style={{
            background: 'var(--cap-surface)', border: '1px solid var(--cap-border)',
            borderRadius: 'var(--cap-radius-md)', padding: '8px 10px',
            color: roleId ? 'var(--cap-fg-1)' : 'var(--cap-fg-3)', fontSize: 13, cursor: 'pointer',
          }}
        >
          <option value="">No role — use default stage order</option>
          {roles.map((r) => (
            <option key={r.id} value={r.id}>{r.name}</option>
          ))}
        </select>
        {roles.length === 0 && (
          <span style={{ fontSize: 11, color: 'var(--cap-fg-3)' }}>
            No roles created yet.{' '}
            <a href="/roles/new" style={{ color: 'var(--cap-accent)', textDecoration: 'none' }}>
              Create one
            </a>
          </span>
        )}
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
