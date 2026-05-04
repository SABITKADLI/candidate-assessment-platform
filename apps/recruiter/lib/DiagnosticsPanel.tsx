'use client';

import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { DiagnosticCheck, DiagnosticStatus, DiagnosticsResponse } from '@cap/shared/diagnostics';
import { Activity, AlertTriangle, CheckCircle2, Cloud, Database, KeyRound, RefreshCw, ServerCog, ShieldCheck, XCircle } from 'lucide-react';
import { Card } from '@cap/ui';

type AdminDiagnosticsResponse = DiagnosticsResponse & {
  assessment?: DiagnosticsResponse;
};

interface DiagnosticsPanelProps {
  initialSnapshot: AdminDiagnosticsResponse;
}

const SECTIONS: Array<{ id: string; title: string; icon: ReactNode }> = [
  { id: 'admin-runtime', title: 'Admin Runtime', icon: <ServerCog size={15} strokeWidth={1.8} /> },
  { id: 'assessment-runtime', title: 'Assessment Runtime', icon: <Activity size={15} strokeWidth={1.8} /> },
  { id: 'database', title: 'Database', icon: <Database size={15} strokeWidth={1.8} /> },
  { id: 'queue', title: 'Redis And Queues', icon: <ServerCog size={15} strokeWidth={1.8} /> },
  { id: 'worker', title: 'Workers', icon: <Activity size={15} strokeWidth={1.8} /> },
  { id: 'storage', title: 'S3 Storage', icon: <Cloud size={15} strokeWidth={1.8} /> },
  { id: 'external-api', title: 'External APIs', icon: <KeyRound size={15} strokeWidth={1.8} /> },
];

const STATUS_META: Record<DiagnosticStatus, {
  label: string;
  icon: React.ReactNode;
  color: string;
  background: string;
  border: string;
}> = {
  ok: {
    label: 'OK',
    icon: <CheckCircle2 size={13} strokeWidth={2} />,
    color: 'var(--cap-success)',
    background: 'var(--cap-success-muted)',
    border: 'var(--cap-success-border)',
  },
  warn: {
    label: 'WARN',
    icon: <AlertTriangle size={13} strokeWidth={2} />,
    color: 'var(--cap-warning)',
    background: 'var(--cap-warning-muted)',
    border: 'var(--cap-warning-border)',
  },
  fail: {
    label: 'FAIL',
    icon: <XCircle size={13} strokeWidth={2} />,
    color: 'var(--cap-danger)',
    background: 'var(--cap-danger-muted)',
    border: 'var(--cap-danger-border)',
  },
  skip: {
    label: 'SKIP',
    icon: <ShieldCheck size={13} strokeWidth={2} />,
    color: 'var(--cap-fg-2)',
    background: 'var(--cap-surface-2)',
    border: 'var(--cap-border)',
  },
};

export function DiagnosticsPanel({ initialSnapshot }: DiagnosticsPanelProps) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const grouped = useMemo(() => {
    const map = new Map<string, DiagnosticCheck[]>();
    for (const check of snapshot.checks) {
      const current = map.get(check.scope) ?? [];
      current.push(check);
      map.set(check.scope, current);
    }
    return map;
  }, [snapshot.checks]);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/health/diagnostics', { cache: 'no-store' });
      const payload = await res.json().catch(() => null) as AdminDiagnosticsResponse | { error?: string } | null;
      if (!payload || !('checks' in payload)) {
        throw new Error(payload?.error ?? `HTTP ${res.status}`);
      }
      setSnapshot(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  const updated = new Date(snapshot.generated_at);

  return (
    <div style={{ display: 'grid', gap: 'var(--cap-space-6)' }}>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr) auto',
        gap: 'var(--cap-space-4)',
        alignItems: 'start',
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <StatusChip status={snapshot.ok ? 'ok' : 'fail'} label={snapshot.ok ? 'Production checks clear' : 'Action needed'} />
            <span style={{
              fontSize: 'var(--cap-text-xs)',
              color: 'var(--cap-fg-3)',
              fontFamily: 'var(--cap-font-mono)',
            }}>
              {Number.isNaN(updated.getTime()) ? snapshot.generated_at : updated.toLocaleString()}
            </span>
          </div>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(118px, 1fr))',
            gap: 'var(--cap-space-2)',
            maxWidth: 620,
          }}>
            <SummaryCell label="OK" value={snapshot.summary.ok} status="ok" />
            <SummaryCell label="Warnings" value={snapshot.summary.warn} status="warn" />
            <SummaryCell label="Failures" value={snapshot.summary.fail} status="fail" />
            <SummaryCell label="Skipped" value={snapshot.summary.skip} status="skip" />
          </div>
        </div>

        <button
          type="button"
          onClick={refresh}
          disabled={loading}
          className="cap-btn cap-btn-secondary cap-btn-md"
          style={{ minWidth: 112 }}
        >
          <RefreshCw size={14} strokeWidth={1.9} style={{ animation: loading ? 'cap-spin 800ms linear infinite' : undefined }} />
          {loading ? 'Checking' : 'Refresh'}
        </button>
      </div>

      {error && (
        <Card style={{
          padding: '12px 14px',
          borderColor: 'var(--cap-danger-border)',
          background: 'var(--cap-danger-muted)',
          color: 'var(--cap-danger)',
          fontSize: 'var(--cap-text-sm)',
        }}>
          {error}
        </Card>
      )}

      <div aria-live="polite" style={{ display: 'grid', gap: 'var(--cap-space-8)' }}>
        {SECTIONS.map((section) => {
          const checks = grouped.get(section.id) ?? [];
          if (checks.length === 0) return null;
          return (
            <section key={section.id} style={{ display: 'grid', gap: 'var(--cap-space-3)' }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 'var(--cap-space-3)',
              }}>
                <h2 style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  margin: 0,
                  fontSize: 12,
                  fontWeight: 600,
                  color: 'var(--cap-fg-2)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                }}>
                  <span aria-hidden style={{ display: 'flex', color: 'var(--cap-fg-3)' }}>{section.icon}</span>
                  {section.title}
                </h2>
                <span style={{
                  fontFamily: 'var(--cap-font-mono)',
                  fontSize: 11,
                  color: 'var(--cap-fg-3)',
                }}>
                  {checks.length} checks
                </span>
              </div>

              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(310px, 1fr))',
                gap: 'var(--cap-space-3)',
              }}>
                {checks.map((check) => (
                  <CheckCard key={check.id} check={check} />
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function CheckCard({ check }: { check: DiagnosticCheck }) {
  const meta = STATUS_META[check.status];
  return (
    <Card style={{
      padding: '14px 16px',
      display: 'grid',
      gap: 'var(--cap-space-3)',
      borderColor: check.status === 'fail' ? 'var(--cap-danger-border)' : undefined,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <h3 style={{
            margin: 0,
            fontSize: 'var(--cap-text-base)',
            fontWeight: 600,
            color: 'var(--cap-fg-1)',
          }}>
            {check.label}
          </h3>
          <p style={{
            margin: '4px 0 0',
            fontSize: 'var(--cap-text-sm)',
            color: 'var(--cap-fg-2)',
            lineHeight: 1.45,
          }}>
            {check.summary}
          </p>
        </div>
        <StatusChip status={check.status} />
      </div>

      {check.detail && (
        <p style={{
          margin: 0,
          fontSize: 'var(--cap-text-xs)',
          color: check.status === 'fail' ? 'var(--cap-danger)' : 'var(--cap-fg-3)',
          lineHeight: 1.45,
        }}>
          {check.detail}
        </p>
      )}

      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 10,
        borderTop: '1px solid var(--cap-border)',
        paddingTop: 'var(--cap-space-3)',
      }}>
        <span style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          fontSize: 11,
          color: meta.color,
          fontFamily: 'var(--cap-font-mono)',
        }}>
          {meta.icon}
          {check.required ? 'required' : 'optional'}
        </span>
        {typeof check.latency_ms === 'number' && (
          <span style={{
            fontSize: 11,
            color: 'var(--cap-fg-3)',
            fontFamily: 'var(--cap-font-mono)',
          }}>
            {check.latency_ms}ms
          </span>
        )}
      </div>

      {check.fields && check.fields.length > 0 && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(132px, 1fr))',
          gap: 6,
        }}>
          {check.fields.map((field) => (
            <FieldPill key={`${check.id}-${field.label}`} field={field} />
          ))}
        </div>
      )}
    </Card>
  );
}

function SummaryCell({ label, value, status }: { label: string; value: number; status: DiagnosticStatus }) {
  const meta = STATUS_META[status];
  return (
    <div style={{
      border: `1px solid ${meta.border}`,
      background: value > 0 ? meta.background : 'var(--cap-surface)',
      borderRadius: 'var(--cap-radius-md)',
      padding: '9px 10px',
      minWidth: 0,
    }}>
      <div style={{
        fontSize: 10,
        color: 'var(--cap-fg-3)',
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
        marginBottom: 3,
      }}>
        {label}
      </div>
      <div style={{
        fontFamily: 'var(--cap-font-mono)',
        fontSize: 20,
        lineHeight: 1,
        fontWeight: 600,
        color: value > 0 ? meta.color : 'var(--cap-fg-2)',
      }}>
        {value}
      </div>
    </div>
  );
}

function StatusChip({ status, label }: { status: DiagnosticStatus; label?: string }) {
  const meta = STATUS_META[status];
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      padding: '4px 8px',
      borderRadius: 999,
      border: `1px solid ${meta.border}`,
      background: meta.background,
      color: meta.color,
      fontFamily: 'var(--cap-font-mono)',
      fontSize: 10,
      fontWeight: 600,
      letterSpacing: '0.04em',
      whiteSpace: 'nowrap',
      flexShrink: 0,
    }}>
      {meta.icon}
      {label ?? meta.label}
    </span>
  );
}

function FieldPill({ field }: { field: NonNullable<DiagnosticCheck['fields']>[number] }) {
  const tone = field.tone ?? 'skip';
  const meta = STATUS_META[tone];
  return (
    <div style={{
      border: `1px solid ${meta.border}`,
      background: 'var(--cap-surface-2)',
      borderRadius: 'var(--cap-radius-sm)',
      padding: '6px 7px',
      minWidth: 0,
    }}>
      <div style={{
        fontSize: 9,
        color: 'var(--cap-fg-3)',
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }}>
        {field.label}
      </div>
      <div style={{
        marginTop: 2,
        fontSize: 11,
        lineHeight: 1.25,
        color: meta.color,
        fontFamily: 'var(--cap-font-mono)',
        wordBreak: 'break-word',
      }}>
        {String(field.value)}
      </div>
    </div>
  );
}
