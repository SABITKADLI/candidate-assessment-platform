'use client';

import { useState } from 'react';
import type { FlagSeverity } from '@cap/shared/enums';

const SEVERITIES: FlagSeverity[] = ['info', 'low', 'medium', 'high', 'critical'];

const SEV_COLORS: Record<FlagSeverity, string> = {
  info:     'var(--cap-info)',
  low:      'var(--cap-fg-2)',
  medium:   'var(--cap-warning)',
  high:     'var(--cap-danger)',
  critical: 'var(--cap-critical)',
};

interface Props {
  id: string;
  resolved: boolean;
  severity: FlagSeverity;
}

export function FlagActions({ id, resolved: initialResolved, severity: initialSeverity }: Props) {
  const [resolved, setResolved]   = useState(initialResolved);
  const [severity, setSeverity]   = useState<FlagSeverity>(initialSeverity);
  const [saving, setSaving]       = useState(false);

  async function patch(updates: { resolved?: boolean; severity?: FlagSeverity }) {
    setSaving(true);
    try {
      const res = await fetch(`/api/flags/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(updates),
      });
      if (res.ok) {
        if (updates.resolved !== undefined) setResolved(updates.resolved);
        if (updates.severity !== undefined) setSeverity(updates.severity);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'nowrap' }}>
      {/* Severity selector */}
      <select
        value={severity}
        disabled={saving}
        aria-label="Flag severity"
        onChange={(e) => {
          const v = e.target.value as FlagSeverity;
          void patch({ severity: v });
        }}
        style={{
          fontFamily: 'var(--cap-font-mono)',
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: '0.04em',
          padding: '3px 6px',
          borderRadius: 'var(--cap-radius-sm)',
          border: '1px solid var(--cap-border)',
          background: 'var(--cap-surface-2)',
          color: SEV_COLORS[severity],
          cursor: 'pointer',
          outline: 'none',
          appearance: 'none',
          WebkitAppearance: 'none',
          minWidth: 70,
          textTransform: 'uppercase',
        }}
      >
        {SEVERITIES.map((s) => (
          <option key={s} value={s} style={{ color: SEV_COLORS[s], background: 'var(--cap-surface-2)', textTransform: 'uppercase' }}>
            {s}
          </option>
        ))}
      </select>

      {/* Resolve / Reopen toggle */}
      <button
        type="button"
        disabled={saving}
        onClick={() => void patch({ resolved: !resolved })}
        style={{
          fontFamily: 'var(--cap-font-sans)',
          fontSize: 11,
          fontWeight: 500,
          padding: '4px 10px',
          borderRadius: 'var(--cap-radius-sm)',
          border: '1px solid',
          cursor: saving ? 'not-allowed' : 'pointer',
          opacity: saving ? 0.5 : 1,
          whiteSpace: 'nowrap',
          transition: 'background var(--cap-transition), color var(--cap-transition)',
          ...(resolved
            ? {
                background: 'var(--cap-surface-2)',
                color: 'var(--cap-fg-2)',
                borderColor: 'var(--cap-border)',
              }
            : {
                background: 'var(--cap-success-muted)',
                color: 'var(--cap-success)',
                borderColor: 'var(--cap-success-border)',
              }),
        }}
      >
        {saving ? '…' : resolved ? 'Reopen' : 'Resolve'}
      </button>
    </div>
  );
}
