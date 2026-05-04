# @cap/sandbox-worker

Executes candidate code from Stage B in a one-shot, isolated container.
BullMQ consumer on the host; gVisor-wrapped Docker container per job.

## Flow

```
 Stage B API  --(enqueue)-->  Redis (BullMQ: sandbox-runs)
                                     │
                                     ▼
                       sandbox-worker (this package)
                                     │
                     ┌────────────────┴────────────────┐
                     ▼                                 ▼
          docker run --rm --runtime=runsc     host reads /out/result.json
          (image: cap/sandbox)                 and writes to app.stage_attempts
```

1. Worker pulls job, writes `job.json` to a host tmpdir.
2. Spawns `docker run` with the hardening flags (below).
3. Runner inside the container materializes files to `/work` (tmpfs),
   executes `test_cmd` with cwd=`/work`, writes `/out/result.json`.
4. Worker reads the result, merges it into `app.stage_attempts.raw_payload`,
   and appends audit entries.

## Hardening (host flags)

Applied in `src/docker.ts`:

| Flag                                       | Purpose                       |
|--------------------------------------------|-------------------------------|
| `--runtime=runsc`                          | gVisor userspace kernel       |
| `--network=none`                           | No egress                     |
| `--read-only`                              | Rootfs immutable              |
| `--tmpfs /work:size=256m,noexec,nosuid`    | Writable scratch              |
| `--tmpfs /tmp:size=64m,noexec,nosuid`      | Writable scratch              |
| `--cap-drop=ALL`                           | No Linux capabilities         |
| `--security-opt=no-new-privileges`         | Prevent setuid escalation     |
| `--security-opt=seccomp=./seccomp.json`    | Custom denylist (see below)   |
| `--pids-limit=128`                         | Fork-bomb guard               |
| `--memory=<N>m --memory-swap=<N>m`         | Hard memory cap, no swap      |
| `--cpus=1`                                 | CFS quota                     |
| `--ulimit nofile=256:256 nproc=128:128`    | Process/fd caps               |
| `--user 10000:10000`                       | Non-root UID                  |
| `-v <inDir>:/in:ro  -v <outDir>:/out:rw`   | Job in, result out            |

`gVisor + seccomp + dropped caps + no-net + read-only rootfs + tmpfs + non-root`
is the full stack. Each is load-bearing; removing one weakens the others.

## Seccomp

`seccomp.json` is `defaultAction=SCMP_ACT_ERRNO` with an explicit allow-list
covering Python and Node runtimes, plus a denies section for syscalls that
stay forbidden regardless of future allow-list edits (`unshare`, `mount`,
`ptrace`, `bpf`, `perf_event_open`, `keyctl`, module loading, `kexec*`,
`quotactl`, `swap*`, `userfaultfd`, `vmsplice`, …).

Under gVisor this is defense-in-depth — runsc already mediates syscalls.

## Result protocol

Authoritative result is written by the runner to `/out/result.json`. The host
never parses candidate stdout as data; it's captured for display only.

- `timed_out` — set by the runner when the inner SIGTERM/SIGKILL fires.
- `oom_killed` — set by the host by inspecting `docker run` stderr.
- `tests` — parsed from `pytest --report-log=/tmp/pytest.jsonl` when present,
  otherwise TAP-style `ok/not ok` from stdout.

If `/out/result.json` is missing, the host synthesizes a `RunResult` with
`error.code = "no_result_file"` (or `"host_timeout"` if we killed the
container ourselves).

## Fargate caveat (important)

**Plain AWS Fargate does not support custom container runtimes — you cannot
run runsc under stock Fargate.** The project's phrase "Docker on Fargate with
gVisor" needs one of:

1. **ECS on EC2** — we provision an ASG, install runsc on each host, and the
   ECS task spec sets `runtimePlatform` + `runtime: runsc`. Full control,
   cheapest per-run; ops tax.
2. **Fargate without gVisor** — Fargate already runs each task on a
   Firecracker microVM (per-task hypervisor boundary). Acceptable for an
   MVP; add runsc later by migrating to ECS-on-EC2.
3. **EKS with gVisor RuntimeClass** — run the workers as pods on nodes with
   runsc installed (`gvisor` RuntimeClass). Heavier but composes well if
   you already run k8s.

The worker code is identical across 1/3; Fargate (option 2) requires setting
`SANDBOX_RUNTIME=runc`.

## Env

```
SANDBOX_IMAGE=cap/sandbox:latest
SANDBOX_RUNTIME=runc                  # use runsc only on hosts with gVisor installed
SANDBOX_SECCOMP_PATH=/etc/cap/seccomp.json
REDIS_URL=redis://127.0.0.1:6379
SANDBOX_QUEUE=sandbox-runs
SANDBOX_CONCURRENCY=2
DATABASE_URL=postgres://...
```

## Build the image

```bash
cd apps/sandbox-worker
IMAGE=cap/sandbox:latest ./scripts/build-image.sh
```

On Windows PowerShell from the repo root:

```powershell
powershell -ExecutionPolicy Bypass -File apps/sandbox-worker/scripts/build-image.ps1
```

## Production Docker

The sandbox worker must run on a host with Docker access. It starts one
short-lived container per candidate code run, using `SANDBOX_IMAGE`.

From the repo root on the worker host:

```bash
cp workers.env.example workers.env
# fill DATABASE_URL, REDIS_URL, SANDBOX_* values

bash apps/sandbox-worker/scripts/build-image.sh
docker compose -f docker-compose.workers.yml --profile sandbox up -d --build
docker compose -f docker-compose.workers.yml --profile sandbox logs -f
```

On Windows PowerShell, use the PowerShell image helper instead of the bash
script:

```powershell
powershell -ExecutionPolicy Bypass -File apps/sandbox-worker/scripts/build-image.ps1
```

Use `SANDBOX_RUNTIME=runc` for a normal Docker host. Switch to `runsc` only
after installing gVisor on the host and confirming `docker run --runtime runsc`
works. `SANDBOX_SECCOMP_PATH` is optional; set it only to an absolute path that
exists on the worker host.

The worker writes a redacted Redis heartbeat to `cap:health:worker:sandbox`
every 30 seconds. The recruiter `/settings` page uses that key, plus BullMQ
worker registration, to show whether the sandbox worker is alive on the same
Redis database and queue.

## Limits worth knowing

- Max `timeout_ms`: 120_000 (two minutes). Stage B coding tasks shouldn't
  need more; long-running work samples go through a different pipeline.
- Max `memory_mb`: 2048. Most problems run under 256 MiB.
- Max files: no explicit cap, but `tmpfs /work` is 256 MiB. Enforce a
  payload-size cap at the producer (Stage B API) ahead of this.
