// Wire protocol between the host worker and the in-container runner.
// Passed as JSON on disk (bind-mounted); never mixed with stdout because
// candidate code may write arbitrary bytes there.

export type Language = 'python' | 'node';

export interface RunFile {
  path: string;          // relative to /work; no '..', no leading '/'
  content: string;       // utf-8
  mode?: number;         // optional; default 0o644
}

export interface RunRequest {
  id: string;                  // matches app.stage_attempts.id
  language: Language;
  files: RunFile[];            // candidate submission
  tests: RunFile[];            // hidden test harness (written after files)
  test_cmd: string[];          // argv executed with cwd=/work
  timeout_ms: number;          // per-run budget (soft + hard)
  memory_mb: number;           // advisory; host also sets cgroup limit
  env?: Record<string, string>;// minimal, vetted host-side
}

export interface TestCase {
  name: string;
  status: 'passed' | 'failed' | 'error' | 'skipped';
  duration_ms?: number;
  message?: string;            // truncated
}

export interface RunResult {
  id: string;
  exit_code: number;
  duration_ms: number;
  timed_out: boolean;
  oom_killed: boolean;
  stdout: string;              // truncated to STDOUT_CAP
  stderr: string;              // truncated to STDERR_CAP
  tests?: {
    passed: number;
    failed: number;
    total: number;
    cases?: TestCase[];        // parsed from test_cmd output when possible
  };
  error?: { code: string; message: string };
}

export const STDOUT_CAP = 64 * 1024;   // 64 KiB
export const STDERR_CAP = 64 * 1024;
export const FILE_PATH_RE = /^(?!\.)[A-Za-z0-9_./-]{1,200}$/;
