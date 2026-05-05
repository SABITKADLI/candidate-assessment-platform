# Candidate Assessment Platform (CAP)

A full-stack, multi-app monorepo for running structured candidate assessments — psychometric screening (Stage A) followed by technical evaluation (Stage B) — with automated scoring, AI-generated memos, proctoring flags, and recruiter tooling.

---

## Architecture

```
candidate-assessment-platform/
├── apps/
│   ├── candidate/          Next.js 15 — candidate-facing assessment UI
│   ├── recruiter/          Next.js 15 — recruiter dashboard
│   ├── scoring-worker/     BullMQ worker — async scoring & memos
│   ├── sandbox-worker/     BullMQ worker — Docker code execution
│   └── mcp-server/         MCP server — AI agent integration
└── packages/
    ├── db/                 PostgreSQL client + hash-chain audit log
    ├── shared/             Enums, Zod schemas, type contracts
    ├── ui/                 Shared component library
    ├── antibot/            Behavioral fingerprinting package
    └── config-ts/          Shared TypeScript configs
```

**Stack:** Next.js 15, TypeScript, postgres.js, BullMQ (Redis), Anthropic Claude API, Auth0, Cloudflare Turnstile, Docker/gVisor (sandbox), S3, MCP SDK.

---

## Auth Boundaries

- **Candidate**: no login. `/s/[token]` validates an opaque `tok_` resume token against `app.sessions`, mints an `httpOnly` `cap_sess` cookie, and middleware gates every route behind it. Short-lived, non-transferable.
- **Recruiter**: Auth0 v4 handles `/auth/*`. Server-rendered recruiter pages require a valid Auth0 session before reading database-backed admin data.
- Apps run on separate ports (separate subdomains in production) — cookies never cross the boundary.

---

## Apps

### `apps/candidate` — Candidate App

Token-gated assessment portal. Candidate receives an invite URL, is routed through each stage in order, and lands on a completion screen.

**Routes**

| Route | Description |
|---|---|
| `/` | Landing / error page |
| `/s/[token]` | Resume-token gate → sets cookie, redirects to next incomplete stage |
| `/s/[token]/challenge` | Cloudflare Turnstile bot check |
| `/s/[token]/welcome` | Stage completion + Stage B pipeline link |
| `/s/[token]/a_resume` | Stage A: Resume upload (PDF/DOCX, S3) |
| `/s/[token]/a_id_liveness` | Stage A: Identity + liveness check |
| `/s/[token]/a_gma` | Stage A: General mental ability (20 timed items sampled from 50, server-graded) |
| `/s/[token]/a_big5` | Stage A: Big Five personality (122 items including attention checks) |
| `/s/[token]/a_mbti` | Stage A: MBTI type indicator |
| `/s/[token]/a_rorschach` | Stage A: Rorschach inkblot (10 cards) |
| `/s/[token]/a_integrity` | Stage A: Integrity scale (32 items) |
| `/s/[token]/a_sjt` | Stage A: Situational judgement (10 scenarios + attention check) |
| `/s/[token]/b_coding` | Stage B: Coding challenge (sandbox execution) |
| `/s/[token]/b_debug` | Stage B: Debug challenge |
| `/s/[token]/b_work_sample` | Stage B: Work sample (written design response) |
| `/s/[token]/b_async_video` | Stage B: Async video response |
| `/s/[token]/b_verbal` | Stage B: Verbal reasoning |

**API Routes**

| Route | Description |
|---|---|
| `POST /api/stages/complete` | Stage completion: writes attempt, timing/attention flags, enqueues scoring |
| `POST /api/stages/b_coding/submit` | Coding submission → enqueues to sandbox worker |
| `POST /api/stages/b_debug/submit` | Debug submission |
| `POST /api/stages/a_gma/next` | GMA next question (server-graded, shuffled) |
| `POST /api/turnstile/verify` | Turnstile token verification |
| `GET /api/cron/expire` | Cron: expire stale sessions |
| `GET /api/health` | Health check |
| `GET /api/health/queues` | Redacted production diagnostics for DB, Redis, queues, workers, S3, and Turnstile |

---

### `apps/recruiter` — Recruiter Dashboard

Internal Next.js app. Requires Auth0 and DATABASE_URL.

**Pages**

| Page | Description |
|---|---|
| `/` | Home / auth gate |
| `/dashboard` | Stats overview (totals, completions, open flags, in-progress) + recent sessions |
| `/dashboard/new` | Create assessment session — generates invite link |
| `/sessions` | Full sessions list with status badges + invite link copy |
| `/sessions/[id]` | Session detail: composite score, per-bucket breakdown, stage attempts, flags, artifacts, Claude memo |
| `/flags` | All proctoring flags (open + resolved) with expandable flag reference guide |
| `/outbox` | ATS delivery outbox: per-row status, retry button, error log |
| `/settings` | Production diagnostics + manual rescore panel |
| `/roles` | Role list — custom stage sets and scoring weights |
| `/roles/new` | Create role (presets: Developer, PM, Data Scientist, Designer, GM) |
| `/roles/[id]` | Edit role |

**API Routes**

| Route | Description |
|---|---|
| `POST /api/sessions/create` | Create session(s) — single stage or A+B pipeline |
| `GET /api/roles` | List roles |
| `POST /api/roles` | Create role |
| `PUT /api/roles/[id]` | Update role |
| `DELETE /api/roles/[id]` | Delete role |
| `POST /api/sessions/[id]/rescore` | Manually trigger rescore job |
| `PATCH /api/flags/[id]` | Resolve / escalate flag |
| `POST /api/outbox/retry` | Retry failed ATS delivery |
| `GET /api/cron/expire-sessions` | Cron: expire stale sessions |
| `GET /api/health` | Health check |
| `GET /api/health/diagnostics` | Auth-protected combined diagnostics for admin + assessment |

---

### `apps/scoring-worker` — Scoring Worker

BullMQ worker. Triggered by stage completions or manual rescore.

**Pipeline per job:**
1. `stage-score` queue — AI-first per-stage grading inside `scoring-worker` (deterministic stages stay mechanical; judgement stages use primary + verifier runs)
2. `computeComposite()` — weighted bucket average × proctoring multiplier, persisted to `app.scores`
3. `generateMemo()` — Claude markdown memo with recommendation (`advance` / `hold` / `decline`), uploaded to S3
4. `enqueueAts()` — builds Greenhouse / Lever / Workday payloads, inserts into `app.ats_outbox`
5. `startOutboxLoop()` — in-process delivery: HMAC-signed HTTP POST, exponential backoff, 8-attempt limit

**Score buckets:** `gma`, `coding`, `work_sample`, `verbal`, `sjt`, `big5_mbti`, `integrity`, `rorschach`, `resume`, `id_liveness`

---

### `apps/sandbox-worker` — Sandbox Worker

BullMQ worker that executes candidate code in isolation.

- Docker container per run (supports `runsc`/gVisor runtime)
- Seccomp syscall filtering via `seccomp.json`
- OOM limit, CPU cap, PID limit, network disabled
- Scoring: test pass-rate → OOM/timeout (0) → exit code (100/0)
- Result written back to `app.stage_attempts.raw_payload` + score column

---

### `apps/mcp-server` — MCP Server

Exposes assessment data to AI agents via Model Context Protocol (Streamable HTTP transport on port 8787).

**Tools**

| Tool | Scopes | Description |
|---|---|---|
| `search_candidates` | `candidates:read` | Paginated session list with filters. Emails redacted without PII scope. |
| `get_candidate_report` | `candidates:read` | Full report: scores, flags, artifacts, presigned memo URL |
| `replay_session` | `candidates:read` + `sessions:replay` | Proctoring telemetry in forensic order |
| `flag_for_review` | `flags:write` | Attach a review flag (audited) |
| `push_to_ats` | `ats:push` | Enqueue ATS push |

Auth: Auth0 JWT. Redis rate limiting per tool per caller.

---

## Packages

### `packages/db`
- `sql` — postgres.js singleton
- `auditLog(actor, action, target, payload)` — appends to hash-chain audit log
- `verifyAuditChain()` — detects tampering

### `packages/shared`
- **Enums:** `StageKey` (13 values), `StageGroup` (A/B), `SessionStatus` (7 values), `ArtifactKind`, `FlagSeverity`
- **Schemas:** `zResumeToken`, `zConsentPayload`, `zTelemetryEvent`, `zTelemetryBatch`
- `STAGE_GROUP_OF` — maps every stage key to its group

### `packages/ui`
Components: `Button`, `Card`, `Input`, `Sidebar`, `StageShell`, `StatusBadge`, `FlagBadge`, `Badge`, `Skeleton`, `ThemeToggle`, `ProgressBar`, `SkipLink`
Design tokens: `tokens.css` (CSS custom properties — spacing, typography, colors, radius, transitions)

### `packages/antibot`
Behavioral fingerprinting: mouse dynamics, keyboard cadence, environment hash, composite anti-bot score. Attached to every stage via `<AntibotBoot>`.

---

## Roles & Stage Configuration

Recruiters create **Roles** defining:
- Which Stage A assessments to include (from 8)
- Which Stage B assessments to include (from 5)
- Per-bucket scoring weights (normalised — do not need to sum to 100)

Built-in presets: **Developer**, **Product Manager**, **Data Scientist**, **Designer**, **General Manager**.

Sessions without a role use default stage order and default weights.

---

## Proctoring & Flags

Flags raised automatically on stage completion:

| Flag | Severity | Trigger |
|---|---|---|
| `timing.too_fast` | medium | Duration < absolute minimum OR < 50% of median for that stage |
| `attention.check_failed` | medium | `attention_check_failures` array in submitted payload |

Flags lower the composite via `proctoring_mult` (floor 0.5×). Recruiters resolve or escalate from `/flags` or the session detail page.

---

## Environment Variables

### `apps/candidate`
| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL |
| `REDIS_URL` | Yes | BullMQ queues |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | No | Turnstile widget |
| `TURNSTILE_SECRET_KEY` | No | Turnstile server verify |
| `S3_BUCKET` / `AWS_REGION` / `AWS_*` | Yes in prod | Direct resume, liveness, video, and audio uploads |
| `NEXT_PUBLIC_CANDIDATE_BASE_URL` | No | Base URL for invite links |

### `apps/recruiter`
| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL |
| `REDIS_URL` | Yes | Scoring queue |
| `AUTH0_ISSUER_BASE_URL` | No | Auth0 domain |
| `AUTH0_CLIENT_ID` / `AUTH0_CLIENT_SECRET` | No | Auth0 app |
| `NEXT_PUBLIC_CANDIDATE_BASE_URL` | No | Candidate app base URL |
| `RESEND_API_KEY` | No | Resend API key — enables invite email delivery |
| `EMAIL_FROM` | No | From address (default: `CAP Assessments <noreply@sabitkadli.com>`) |

### `apps/scoring-worker`
| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL |
| `REDIS_URL` | Yes | BullMQ |
| `ANTHROPIC_API_KEY` | No | Claude memo generation |
| `S3_BUCKET` / `AWS_REGION` / `AWS_*` | No | Memo upload |
| `ATS_GREENHOUSE_URL` + `ATS_GREENHOUSE_SECRET` | No | Greenhouse webhook |
| `ATS_LEVER_URL` + `ATS_LEVER_SECRET` | No | Lever webhook |
| `ATS_WORKDAY_URL` + `ATS_WORKDAY_SECRET` | No | Workday webhook |

### `apps/sandbox-worker`
| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL |
| `REDIS_URL` | Yes | BullMQ |
| `SANDBOX_IMAGE` | Yes | Docker image for execution |
| `SANDBOX_RUNTIME` | No | `runsc` or `runc` (default: `runsc`) |
| `SANDBOX_SECCOMP_PATH` | No | Absolute path to seccomp.json on host |

### `apps/mcp-server`
| Variable | Required | Purpose |
|---|---|---|
| `AUTH0_ISSUER` | Yes | Auth0 issuer |
| `AUTH0_AUDIENCE` | Yes | Auth0 audience |
| `DATABASE_URL` | Yes | PostgreSQL |
| `REDIS_URL` | Yes | Rate limiting |
| `S3_PRESIGN_URL` | No | Memo presign endpoint |
| `PORT` | No | HTTP port (default: 8787) |

---

## Email Setup (Resend + sabitkadli.com)

Invite emails are sent via [Resend](https://resend.com) (free tier: 3,000/month, 100/day).

### 1. Create a Resend account

Sign up at resend.com → **Domains** → **Add domain** → enter `sabitkadli.com`.

Resend will give you three DNS records to add. Add them alongside your existing ImprovMX MX records:

| Type | Name | Value |
|---|---|---|
| TXT | `@` (or `sabitkadli.com`) | `v=spf1 include:amazonses.com ~all` *(merge with any existing SPF)* |
| TXT | `resend._domainkey` | *(DKIM key provided by Resend — unique per account)* |
| TXT | `_dmarc` | `v=DMARC1; p=none; rua=mailto:dmarc@sabitkadli.com` *(optional but recommended)* |

> **ImprovMX coexistence:** The SPF and DKIM records are independent of ImprovMX. Your existing MX records (`mx1.improvmx.com`, `mx2.improvmx.com`) stay exactly as-is for inbound forwarding. Resend uses its own DKIM subdomain (`resend._domainkey`) so there is no conflict.

### 2. Verify in Resend dashboard

Once DNS propagates (usually a few minutes), click **Verify** in Resend → Domains. Status should turn green.

### 3. Create an API key

Resend → **API Keys** → **Create API Key** → scope: `Sending access` → copy the key.

### 4. Add to env

```bash
# apps/recruiter/.env.local
RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxx
EMAIL_FROM="CAP Assessments <noreply@sabitkadli.com>"
```

### 5. Create the sending alias in ImprovMX (optional)

If you want replies to `noreply@sabitkadli.com` to forward somewhere, add an alias in ImprovMX. Not required for outbound sending — Resend handles delivery directly via its own infrastructure.

---

## Getting Started

```bash
pnpm install
pnpm build              # build all packages

# Set up per-app env files
cp .env.example apps/candidate/.env.local
cp .env.example apps/recruiter/.env.local

# Apply DB migrations
pnpm db:migrate

# Check DB migration status
pnpm db:migrate:status

# Dev mode (candidate + recruiter)
pnpm dev
#   candidate  → http://localhost:3000
#   recruiter  → http://localhost:3001

# Workers (separate terminals)
cd apps/scoring-worker && pnpm start
cd apps/sandbox-worker && pnpm start
cd apps/mcp-server     && pnpm start
```

---

## Production Workers

The web apps run on Vercel, but the BullMQ workers must run as long-lived
processes on a worker host. The sandbox worker also needs Docker access because
it starts one isolated container per candidate code run.

Use `workers.env` for the worker host. It is ignored by git and by Docker build
contexts. Start from `workers.env.example`, then fill production values:

```bash
cp workers.env.example workers.env
```

Required shared values:

```env
DATABASE_URL=postgresql://...        # production Neon/Postgres URL
REDIS_URL=rediss://...               # same Vercel Redis used by the candidate app
AWS_REGION=us-east-1
S3_BUCKET=cap-assessment-prod-sabitkadli-us-east-1
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
```

Scoring worker values:

```env
SCORING_QUEUE=scoring-runs
SCORING_CONCURRENCY=2
ANTHROPIC_API_KEY=...
MEMO_MODEL=claude-sonnet-4-6
ATS_GREENHOUSE_URL=
ATS_GREENHOUSE_SECRET=
ATS_LEVER_URL=
ATS_LEVER_SECRET=
ATS_WORKDAY_URL=
ATS_WORKDAY_SECRET=
```

Sandbox worker values:

```env
SANDBOX_QUEUE=sandbox-runs
SANDBOX_IMAGE=cap/sandbox:latest
SANDBOX_RUNTIME=runc                 # use runsc only on hosts with gVisor installed
SANDBOX_CONCURRENCY=1
```

Build and run:

```bash
docker compose -f docker-compose.workers.yml --profile all config --quiet
docker compose -f docker-compose.workers.yml --profile all build

# Build the candidate-code runner image used by sandbox jobs.
bash apps/sandbox-worker/scripts/build-image.sh

# Start one or both workers.
docker compose -f docker-compose.workers.yml --profile scoring up -d
docker compose -f docker-compose.workers.yml --profile sandbox up -d

docker compose -f docker-compose.workers.yml --profile all ps
docker compose -f docker-compose.workers.yml --profile all logs -f
```

After filling real ATS webhook credentials, verify HMAC delivery before relying
on live outbox rows:

```bash
pnpm --filter @cap/scoring-worker ats:check
```

On Windows PowerShell, build the candidate-code runner image with:

```powershell
powershell -ExecutionPolicy Bypass -File apps/sandbox-worker/scripts/build-image.ps1
```

Do not run these workers on Vercel serverless. For production, run them on an
always-on VPS or worker platform with Docker support. Queue names are fixed in
`packages/shared/src/queues.ts`: `scoring-runs` and `sandbox-runs`.

The workers write Redis heartbeats every 30 seconds:

```text
cap:health:worker:scoring
cap:health:worker:sandbox
```

Open `/settings` in the recruiter console to verify the web apps, Redis queues,
worker heartbeats, S3, Auth0, Resend, Anthropic, Turnstile, and migration state
from one screen. For a private assessment diagnostics endpoint, set the same
`DIAGNOSTICS_SECRET` on both Vercel projects; the admin diagnostics route will
send it to `GET /api/health/queues`.

---

## Direct S3 Uploads

Candidate files upload directly from the browser to S3 using presigned `PUT`
URLs. This keeps video/audio/resume payloads out of Vercel Functions and avoids
the platform request body limit. The candidate app only presigns and records the
completed artifact.

Required candidate Vercel env:

```env
AWS_REGION=us-east-1
S3_BUCKET=cap-assessment-prod-sabitkadli-us-east-1
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
```

The same S3 env must also exist on the scoring worker so assessment memos can be
uploaded to S3. The IAM user/key needs object access on the production bucket:
`s3:PutObject` and `s3:GetObject` on `arn:aws:s3:::cap-assessment-prod-sabitkadli-us-east-1/*`.
`s3:ListBucket` is only needed for manual/debug listing.

Set bucket CORS to allow the browser upload headers:

```json
[
  {
    "AllowedOrigins": [
      "https://assessment.sabitkadli.com",
      "http://localhost:3000"
    ],
    "AllowedMethods": ["PUT", "HEAD", "GET"],
    "AllowedHeaders": [
      "Content-Type",
      "x-amz-checksum-sha256",
      "x-amz-meta-sha256",
      "x-amz-meta-session-id",
      "x-amz-meta-upload-kind"
    ],
    "ExposeHeaders": ["ETag", "x-amz-checksum-sha256"],
    "MaxAgeSeconds": 3000
  }
]
```

Upload flow:

1. Browser hashes the file and asks `/api/uploads/presign` for a short-lived S3 URL.
2. Browser sends the file directly to S3 with checksum and metadata headers.
3. Browser calls `/api/uploads/complete`; the candidate app verifies the S3 object with `HeadObject` and writes `app.artifacts`.

Legacy multipart upload routes now return `410 direct_upload_required`.

---

## Database Migrations

SQL migrations live in `db/migrations` and are applied in filename order by
`packages/db/scripts/migrate.mjs`. Every migration should be wrapped in explicit
`BEGIN` / `COMMIT` statements.

```bash
pnpm db:migrate:status
pnpm db:migrate
```

The runner creates `app.schema_migrations`, stores checksums, and refuses to run
if an already-applied migration file changes. Runtime schema guards have been
removed from recruiter routes; schema changes should go through migrations.

---

## Database Schema (key tables)

```
app.candidates          email, consent_version, consent_ts, fingerprint
app.sessions            candidate_id, stage(A/B), status, resume_token, expires_at, role_id
app.stage_attempts      session_id, stage_key, attempt_no, score, raw_payload, duration_s
app.scores              session_id, composite, per_stage(jsonb), proctoring_mult, memo_text, recommendation, memo_s3_key
app.proctoring_flags    session_id, stage_key, severity, reason, details, resolved
app.artifacts           session_id, stage_key, kind, s3_key, mime_type, size_bytes
app.roles               name, description, stages_a[], stages_b[], stage_weights(jsonb), weights_version
app.ats_outbox          session_id, ats, payload, status, attempts, next_attempt_at, last_error, delivered_at
audit.audit_log         seq, actor, action, target, payload, prev_hash, hash  (tamper-evident chain)
```

---

## Complete Status: Done vs Pending

### Done

#### Core infrastructure
- [x] Turborepo + pnpm monorepo
- [x] `@cap/db` — postgres.js + hash-chain audit log with verify
- [x] `@cap/shared` — full enum set + Zod schemas
- [x] `@cap/ui` — component library with CSS design tokens
- [x] `@cap/antibot` — mouse/keyboard behavioral fingerprinting
- [x] Session token system — opaque `tok_` tokens, httpOnly cookie
- [x] Rate limiting on all candidate API routes
- [x] Cloudflare Turnstile bot gate
- [x] Production worker Dockerfiles and `docker-compose.workers.yml`
- [x] Worker env template (`workers.env.example`) and secret-safe Docker ignore rules
- [x] Formal SQL migration runner with checksum tracking (`pnpm db:migrate`)
- [x] GitHub Actions CI for lint, tests, typecheck, build, and worker compose validation

#### Candidate app
- [x] Middleware session routing (resume token → next stage)
- [x] Welcome / completion screen with Stage B pipeline link
- [x] Challenge page (Turnstile gate)
- [x] All 8 Stage A pages: Resume, ID Liveness, GMA, Big Five, MBTI, Rorschach, Integrity, SJT
- [x] All 5 Stage B pages: Coding, Debug, Work Sample, Async Video, Verbal
- [x] AntibotBoot fingerprinting on every stage
- [x] GmaPlayer — 20-item timed test sampled from 50-item server-side bank, shuffled and graded on the server
- [x] CodingPlayer — code submission to sandbox queue
- [x] ResumeUploader — drag-and-drop PDF/DOCX, direct S3 upload, progress indicator
- [x] Resume/liveness/video/audio direct-to-S3 uploads via presigned URLs
- [x] Stage completion API — server-side validation, timing flags, attention-check flags, stage-score enqueue
- [x] B_CODING + B_DEBUG submit routes → sandbox queue
- [x] A_GMA next-question route (server-side item bank)
- [x] Turnstile verify route
- [x] Role-specific stage order overrides
- [x] Session expiry cron

#### Recruiter app
- [x] Auth0 authentication with server-side session guards on recruiter data pages
- [x] Dashboard: live stats (total, completed, open flags, in-progress) + recent sessions table
- [x] Sessions list
- [x] Session detail: composite score, per-bucket bar chart, stage attempt table, proctoring flags, artifacts list, Claude memo
- [x] Proctoring flags page (open/resolved separation, severity sort, expandable flag reference)
- [x] ATS outbox page (delivery status per row, retry, error display)
- [x] Settings page (runtime config + rescore panel)
- [x] Roles CRUD with stage checkbox picker and weight input per bucket
- [x] Role presets: Developer, Product Manager, Data Scientist, Designer, General Manager
- [x] New session form: email, stage (A/B/AB), role picker, expiry selector, invite link copy
- [x] Rescore button on session detail
- [x] Flag resolve/escalate actions
- [x] Sidebar with all nav items + active state
- [x] Session expiry cron

#### Scoring worker
- [x] BullMQ async worker (configurable concurrency)
- [x] Stage scorers: B_WORK_SAMPLE via Claude API (word-count fallback), B_ASYNC_VIDEO/B_VERBAL artifact presence, A_RESUME/A_ID_LIVENESS presence=100
- [x] Server-side scoring for A_BIG5, A_MBTI, A_SJT, A_INTEGRITY, plus completion-only A_RORSCHACH policy
- [x] Composite score: weighted bucket average + proctoring multiplier (clamped 0.5–1.0)
- [x] Missing buckets excluded from denominator (partial sessions score fairly)
- [x] Claude-generated assessment memo: markdown + advance/hold/decline recommendation
- [x] S3 memo upload with key stored on scores row
- [x] ATS outbox: Greenhouse (`score_card`), Lever (`note`), Workday (`assessment_result`) payload shapes
- [x] Outbox delivery loop: HMAC-SHA256 signature, exponential backoff, 8-attempt giveup
- [x] ATS webhook credential check command (`pnpm --filter @cap/scoring-worker ats:check`)

#### Sandbox worker
- [x] Docker/gVisor isolated execution
- [x] Seccomp syscall filtering
- [x] Test runner scoring (passed/total × 100)
- [x] OOM + timeout detection (score = 0)
- [x] Full result blob persisted to `stage_attempts.raw_payload`

#### MCP server
- [x] Streamable HTTP MCP server (port 8787)
- [x] Auth0 JWT middleware with scope enforcement
- [x] Per-tool Redis rate limiting
- [x] 5 tools: search_candidates, get_candidate_report, replay_session, flag_for_review, push_to_ats
- [x] PII redaction on email fields without `candidates:read.pii`
- [x] Audit logging on read tools (get_candidate_report, replay_session)

---

### Pending

#### Candidate app
- [x] **Email invite delivery** — Resend integration (`apps/recruiter/lib/sendInviteEmail.ts`). Set `RESEND_API_KEY` to activate; falls back to console log in dev. DNS setup required (see below).
- [ ] **Real code editor** — `CodingPlayer` uses a plain `<textarea>`. Monaco Editor or CodeMirror not yet integrated (syntax highlighting, line numbers, key bindings).
- [ ] **Multi-language B_CODING** — only Python is live. Node.js is in the sandbox job schema but the problem set and submit route only emit Python.
- [ ] **Webcam proctoring stream** — `webcam_frame` is an artifact kind and screenshots are referenced in the DB, but no live webcam capture UI exists during stages.
- [ ] **Consent / onboarding page** — `zConsentPayload` schema and `fingerprint` field exist but no consent route or page is implemented.
- [ ] **FingerprintJS Pro** — `fingerprint` field in consent is optional and unenforced; the FingerprintJS Pro SDK is not yet integrated.
- [ ] **Candidate landing page** — `/` shows minimal error states only; a proper branded invite landing page is missing.

#### Scoring
- [ ] **B_DEBUG end-to-end scoring** — the debug submit route exists and enqueues to the sandbox, but the specific debug problem set and test runner configuration have not been confirmed working end-to-end.

#### ATS integration
- [ ] **Live ATS credentials** — the outbox loop, payload builder, HMAC signing, and credential check command are implemented. Actual Greenhouse / Lever / Workday webhook endpoints + secrets (`ATS_*_URL`, `ATS_*_SECRET`) still need to be provisioned and checked against live accounts.

#### Infrastructure
- [ ] **Always-on worker host** — worker containers build and boot locally, but production still needs a VPS/worker host running `docker-compose.workers.yml` continuously.
- [ ] **S3 presign endpoint** — MCP server delegates to `S3_PRESIGN_URL` but that endpoint is not implemented in the recruiter app.

#### Testing
- [ ] **Broader unit tests** — basic Node tests cover upload contracts, migrations, server-side stage scoring, and ATS signing; route/component logic still needs coverage.
- [ ] **Integration tests** — no test setup or fixtures.
- [ ] **E2E tests** — no Playwright or Cypress.

#### Recruiter app
- [ ] **Session filtering / search** — sessions list has no filter, sort, or search UI.
- [ ] **Candidate comparison view** — no side-by-side score comparison.
- [ ] **Bulk actions** — no bulk advance / decline / re-invite.
- [ ] **Export / CSV download** — no data export.
