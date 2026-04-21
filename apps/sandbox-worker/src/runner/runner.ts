#!/usr/bin/env node
// Runs INSIDE the sandbox container. Untrusted neighbor: candidate code.
// Contract:
//   argv[2] = /in/job.json   (bind-mounted, read-only)
//   argv[3] = /out/result.json (bind-mounted, writable)
//
// Security notes:
//   - We never re-exec any candidate file. We only run `test_cmd`.
//   - stdout/stderr from the child are captured to buffers (size-capped).
//   - The runner's own stdout is ignored by the host; result is read from disk.
//   - Path validation rejects traversal. All writes land under /work (tmpfs).

import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, chmodSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import {
  FILE_PATH_RE, STDERR_CAP, STDOUT_CAP,
  type RunRequest, type RunResult, type TestCase,
} from '../protocol.js';

const [, , inPath, outPath] = process.argv;
const WORK = '/work';

function write(result: RunResult): never {
  try { writeFileSync(outPath!, JSON.stringify(result)); }
  catch { /* host will treat missing file as hard failure */ }
  process.exit(0);
}

function fail(id: string, code: string, message: string): never {
  write({
    id, exit_code: -1, duration_ms: 0,
    timed_out: false, oom_killed: false,
    stdout: '', stderr: '',
    error: { code, message },
  });
}

function materialize(files: RunRequest['files']): void {
  for (const f of files) {
    if (!FILE_PATH_RE.test(f.path)) throw new Error(`bad path: ${f.path}`);
    const dst = resolve(WORK, f.path);
    if (!dst.startsWith(WORK + '/')) throw new Error(`path escape: ${f.path}`);
    mkdirSync(dirname(dst), { recursive: true });
    writeFileSync(dst, f.content, { encoding: 'utf8' });
    if (f.mode) chmodSync(dst, f.mode);
  }
}

function truncate(b: Buffer[], cap: number): { text: string; truncated: boolean } {
  let total = 0; const out: Buffer[] = [];
  for (const chunk of b) {
    if (total >= cap) return { text: Buffer.concat(out).toString('utf8'), truncated: true };
    const take = Math.min(chunk.length, cap - total);
    out.push(chunk.subarray(0, take)); total += take;
  }
  return { text: Buffer.concat(out).toString('utf8'), truncated: total >= cap };
}

// Best-effort test result parsing. Candidates may or may not emit JSON;
// we try common formats and fall back to exit-code-only aggregation.
function parseTests(stdout: string, stderr: string): RunResult['tests'] | undefined {
  // pytest --json-report (writes to file by default, but --json is ad-hoc)
  // We pass --report-log=/tmp/pytest.jsonl in the test_cmd to be robust.
  // Also try to read it if present.
  try {
    const p = '/tmp/pytest.jsonl';
    const raw = readFileSync(p, 'utf8').trim();
    if (raw) {
      const lines = raw.split('\n').map((l) => JSON.parse(l));
      const cases: TestCase[] = [];
      let passed = 0, failed = 0;
      for (const l of lines) {
        if (l?.when === 'call' && l?.nodeid) {
          const status = l.outcome === 'passed' ? 'passed'
                       : l.outcome === 'failed' ? 'failed'
                       : l.outcome === 'skipped' ? 'skipped' : 'error';
          if (status === 'passed') passed++;
          else if (status === 'failed' || status === 'error') failed++;
          cases.push({
            name: String(l.nodeid),
            status,
            duration_ms: Math.round((l.duration ?? 0) * 1000),
            message: l.longrepr ? String(l.longrepr).slice(0, 512) : undefined,
          });
        }
      }
      return { passed, failed, total: passed + failed, cases: cases.slice(0, 200) };
    }
  } catch { /* no pytest file, fall through */ }

  // node --test tap-style
  const tap = stdout + '\n' + stderr;
  const okRe = /^ok\s+\d+/gm, notOkRe = /^not ok\s+\d+/gm;
  const passed = (tap.match(okRe) ?? []).length;
  const failed = (tap.match(notOkRe) ?? []).length;
  if (passed + failed > 0) return { passed, failed, total: passed + failed };

  return undefined;
}

async function main(): Promise<void> {
  if (!inPath || !outPath) process.exit(2);
  let req: RunRequest;
  try { req = JSON.parse(readFileSync(inPath, 'utf8')) as RunRequest; }
  catch (e) { fail('unknown', 'bad_request', String(e)); }

  try {
    mkdirSync(WORK, { recursive: true });
    materialize([...req.files, ...req.tests]);
  } catch (e) { fail(req.id, 'materialize_failed', String(e)); }

  const [cmd, ...args] = req.test_cmd;
  if (!cmd) fail(req.id, 'bad_request', 'empty test_cmd');

  const start = Date.now();
  let timedOut = false;

  const child = spawn(cmd, args, {
    cwd: WORK,
    env: { PATH: '/usr/local/bin:/usr/bin:/bin', HOME: '/work', ...(req.env ?? {}) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const outBuf: Buffer[] = [];
  const errBuf: Buffer[] = [];
  child.stdout.on('data', (c: Buffer) => outBuf.push(c));
  child.stderr.on('data', (c: Buffer) => errBuf.push(c));

  const softTimer = setTimeout(() => {
    timedOut = true;
    try { child.kill('SIGTERM'); } catch { /* noop */ }
    setTimeout(() => { try { child.kill('SIGKILL'); } catch { /* noop */ } }, 1500).unref();
  }, req.timeout_ms);

  const exitCode: number = await new Promise((r) => {
    child.on('close', (code, signal) => r(code ?? (signal ? 128 : -1)));
  });
  clearTimeout(softTimer);

  const duration_ms = Date.now() - start;
  const out = truncate(outBuf, STDOUT_CAP);
  const err = truncate(errBuf, STDERR_CAP);

  write({
    id: req.id,
    exit_code: exitCode,
    duration_ms,
    timed_out: timedOut,
    oom_killed: false,  // host decides from docker wait status
    stdout: out.text,
    stderr: err.text,
    tests: parseTests(out.text, err.text),
  });
}

main().catch((e) => fail('unknown', 'runner_crash', String(e)));
