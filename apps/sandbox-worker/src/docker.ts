import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { RunRequest, RunResult } from './protocol.js';

export interface DockerOptions {
  image: string;                  // e.g. "cap/sandbox:latest"
  runtime?: 'runsc' | 'runc';     // gVisor in prod
  seccompPath?: string;           // absolute host path to seccomp.json
  cpus?: number;                  // default 1
  memoryMb?: number;              // cgroup limit; default req.memory_mb or 512
  pidsLimit?: number;             // default 128
  gracePeriodMs?: number;         // added to req.timeout_ms for outer kill
  network?: 'none' | 'bridge';    // default 'none'
  tmpfsSizeMb?: { work: number; tmp: number }; // default {256, 64}
}

export interface DockerRunOutcome {
  result: RunResult;              // populated or synthesized
  host_error?: string;            // set when docker itself failed (not candidate code)
  oom_killed: boolean;
  wall_ms: number;
}

/**
 * Run one RunRequest in an isolated container. Fire-and-wait; caller queues.
 *
 * Invariants:
 *   - The host never trusts stdout/stderr from the container beyond display.
 *   - Authoritative result lives in result.json (written by the runner).
 *   - If result.json is missing, we synthesize a RunResult with host_error.
 */
export async function runSandbox(req: RunRequest, opts: DockerOptions): Promise<DockerRunOutcome> {
  const tdir = await mkdtemp(join(tmpdir(), `cap-sbx-${req.id}-`));
  const inDir = join(tdir, 'in');
  const outDir = join(tdir, 'out');
  await Promise.all([
    (async () => {
      await writeFile(join(tdir, 'in.mk'), '');  // marker; ignore
    })(),
  ]);
  const { mkdir } = await import('node:fs/promises');
  await mkdir(inDir); await mkdir(outDir);
  await writeFile(join(inDir, 'job.json'), JSON.stringify(req));

  const memMb = opts.memoryMb ?? Math.max(req.memory_mb, 128);
  const cpus = opts.cpus ?? 1;
  const work = opts.tmpfsSizeMb?.work ?? 256;
  const tmp  = opts.tmpfsSizeMb?.tmp  ?? 64;
  const runtime = opts.runtime ?? 'runsc';
  const network = opts.network ?? 'none';
  const name = `cap-sbx-${req.id}-${Math.random().toString(36).slice(2, 8)}`;

  const args: string[] = [
    'run', '--rm', '--name', name,
    '--runtime', runtime,
    `--network=${network}`,
    '--read-only',
    `--tmpfs=/work:rw,noexec,nosuid,nodev,size=${work}m,mode=1777`,
    `--tmpfs=/tmp:rw,noexec,nosuid,nodev,size=${tmp}m,mode=1777`,
    '--cap-drop=ALL',
    '--security-opt=no-new-privileges',
    '--pids-limit', String(opts.pidsLimit ?? 128),
    '--memory', `${memMb}m`,
    '--memory-swap', `${memMb}m`,     // disable swap
    '--cpus', String(cpus),
    '--ulimit', 'nofile=256:256',
    '--ulimit', 'nproc=128:128',
    '--user', '10000:10000',
    '-v', `${inDir}:/in:ro`,
    '-v', `${outDir}:/out:rw`,
  ];
  if (opts.seccompPath) args.push('--security-opt', `seccomp=${opts.seccompPath}`);
  args.push(opts.image, 'node', '/runner/src/runner.js', '/in/job.json', '/out/result.json');

  const start = Date.now();
  const grace = opts.gracePeriodMs ?? 2000;
  const hardBudget = req.timeout_ms + grace + 3000; // runner kills first; host is fallback
  let oomKilled = false;
  let hostError: string | undefined;

  const child = spawn('docker', args, { stdio: ['ignore', 'pipe', 'pipe'] });
  const stderr: Buffer[] = [];
  child.stderr.on('data', (c: Buffer) => stderr.push(c));

  const exitCode: number = await new Promise((resolve) => {
    const t = setTimeout(() => {
      hostError = 'host_timeout';
      spawn('docker', ['kill', '--signal=SIGKILL', name]).on('close', () => {/* noop */});
    }, hardBudget).unref();
    child.on('close', (code) => { clearTimeout(t); resolve(code ?? -1); });
  });

  const wall_ms = Date.now() - start;
  const errText = Buffer.concat(stderr).toString('utf8');

  // Detect OOM from docker's own diagnostics (runsc also surfaces via stderr).
  if (/OOMKilled|out of memory|cgroup .* OOM/i.test(errText)) oomKilled = true;

  let result: RunResult | undefined;
  try {
    const raw = await readFile(join(outDir, 'result.json'), 'utf8');
    result = JSON.parse(raw) as RunResult;
  } catch {
    hostError ??= 'no_result_file';
  }

  await rm(tdir, { recursive: true, force: true }).catch(() => { /* noop */ });

  if (!result) {
    result = {
      id: req.id,
      exit_code: exitCode,
      duration_ms: wall_ms,
      timed_out: hostError === 'host_timeout',
      oom_killed: oomKilled,
      stdout: '',
      stderr: errText.slice(-4096),
      error: { code: hostError ?? 'unknown', message: errText.slice(-512) },
    };
  } else if (oomKilled) {
    result.oom_killed = true;
  }

  return { result, host_error: hostError, oom_killed: oomKilled, wall_ms };
}
