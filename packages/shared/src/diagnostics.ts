export type DiagnosticStatus = 'ok' | 'warn' | 'fail' | 'skip';

export interface DiagnosticField {
  label: string;
  value: string | number | boolean | null;
  tone?: DiagnosticStatus;
}

export interface DiagnosticCheck {
  id: string;
  scope: string;
  label: string;
  status: DiagnosticStatus;
  required: boolean;
  summary: string;
  detail?: string;
  latency_ms?: number;
  fields?: DiagnosticField[];
}

export interface DiagnosticSummary {
  ok: number;
  warn: number;
  fail: number;
  skip: number;
}

export interface DiagnosticsResponse {
  service: 'admin' | 'assessment';
  generated_at: string;
  ok: boolean;
  summary: DiagnosticSummary;
  checks: DiagnosticCheck[];
}

export function summarizeDiagnostics(checks: readonly DiagnosticCheck[]): DiagnosticSummary {
  return checks.reduce<DiagnosticSummary>((acc, check) => {
    acc[check.status] += 1;
    return acc;
  }, { ok: 0, warn: 0, fail: 0, skip: 0 });
}

export function diagnosticsOk(checks: readonly DiagnosticCheck[]): boolean {
  return checks.every((check) => check.status !== 'fail');
}
