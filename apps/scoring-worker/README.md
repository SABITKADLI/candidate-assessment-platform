# @cap/scoring-worker

Composite scoring, Claude-generated hiring memo, and ATS webhook delivery.

## What it does

Consumes from BullMQ queue `scoring-runs`. Per job:

1. **Composite score** — pulls per-attempt scores, buckets by role weights,
   multiplies by the session's `proctoring_mult` (clamped `[0.5, 1.0]`).
   Missing buckets drop out of the denominator instead of zeroing the total.
2. **Memo** — sends a redacted evidence JSON to Claude with the prompt in
   `prompts/memo.md`; uploads the Markdown to S3 (SSE-KMS); parses the final
   recommendation (`advance` / `hold` / `decline`). Skipped gracefully if
   `ANTHROPIC_API_KEY` is unset.
3. **ATS outbox** — writes rows to `app.ats_outbox` for each requested
   provider. A separate in-process loop (`outbox.ts`) drains the table:
   HMAC-SHA256 signs, POSTs, exponential backoff to 1 hour cap, gives up
   after 8 attempts.

## Composite formula

```
composite = clamp_0_100( proctoring_mult × Σ(wᵢ · sᵢ) / Σ(wᵢ) )

where i ranges over role weight buckets that HAVE scored attempts.
```

Stage → bucket (see `src/composite.ts`):
- `A_GMA` → `gma`
- `A_BIG5`, `A_MBTI` → `big5_mbti`
- `A_SJT` → `sjt`
- `A_INTEGRITY` → `integrity`
- `A_RORSCHACH` → `rorschach`
- `B_CODING`, `B_DEBUG` → `coding` (averaged)
- `B_ASYNC_VIDEO`, `B_VERBAL` → `verbal` (averaged)
- `B_WORK_SAMPLE` → `work_sample`

Role defaults (from phase 1 schema): gma 20, work_sample 20, coding 20,
verbal 15, sjt 10, big5_mbti 8, integrity 5, rorschach 2.

## Memo contract

Prompt fixes three exact recommendation strings; the worker parses them
defensively. Memos are capped at 350 words and must not contain JSON/YAML/code
blocks. PII beyond what the worker ships in the evidence is forbidden by the
prompt.

## Outbox semantics

- The outbox poller is disabled when no `ATS_*_URL` or `ATS_*_SECRET`
  variable is configured, so an idle deployment does not keep the database
  awake just to scan an empty table.

- `SELECT ... FOR UPDATE SKIP LOCKED` — multiple replicas can share the
  queue without double-delivery.
- `OUTBOX_INTERVAL_MS` controls active drain cadence; `OUTBOX_IDLE_INTERVAL_MS`
  controls the maximum empty-queue backoff.
- Signing: `X-Cap-Signature: sha256=hex(hmac_sha256(secret, ts + "." + body))`
  with `X-Cap-Timestamp`. Receivers MUST reject if `abs(now - ts) > 5 min`.
- Giveup after 8 attempts (max 1 h backoff); `last_error` preserved for ops.
- Permanent failure if provider URL is unset (`status=failed`, no retries).
- Permanent failure if provider secret is unset (`status=failed`, no retries).

## Env

```
DATABASE_URL=postgres://...
REDIS_URL=redis://...
DATABASE_POOL_MAX=3

# Memo (optional)
ANTHROPIC_API_KEY=...
MEMO_MODEL=claude-sonnet-4-6
AWS_REGION=us-east-1
S3_BUCKET=cap-assessment-prod-sabitkadli-us-east-1
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...

# ATS (per-provider, optional)
ATS_GREENHOUSE_URL=
ATS_GREENHOUSE_SECRET=
ATS_LEVER_URL=
ATS_LEVER_SECRET=
ATS_WORKDAY_URL=
ATS_WORKDAY_SECRET=
OUTBOX_INTERVAL_MS=5000
OUTBOX_IDLE_INTERVAL_MS=600000
```

After filling any real provider pair, run a signed connection check before
enabling live pushes:

```bash
pnpm --filter @cap/scoring-worker ats:check
```

The check posts a small `cap_ats_connection_check` payload with the same HMAC
headers used by the outbox loop. It prints provider names and HTTP status only;
it does not print secrets.

For the current production bucket in Stockholm, use:

```
AWS_REGION=us-east-1
S3_BUCKET=cap-assessment-prod-sabitkadli-us-east-1
```

## Production Docker

The scoring worker is a long-running BullMQ consumer. It should run on a worker
host, not as a Vercel serverless function.

From the repo root on the worker host:

```bash
cp workers.env.example workers.env
# fill DATABASE_URL, REDIS_URL, ANTHROPIC_API_KEY, AWS_* and S3_BUCKET

docker compose -f docker-compose.workers.yml --profile scoring up -d --build
docker compose -f docker-compose.workers.yml --profile scoring logs -f
```

The worker consumes `scoring-runs`. It is safe to run more than one replica for
throughput, but keep `SCORING_CONCURRENCY` modest until database and Claude API
limits are known.

The worker also writes a redacted Redis heartbeat to
`cap:health:worker:scoring` every 30 seconds. The recruiter `/settings` page
uses that key to show whether the scoring worker is alive on the same Redis
database and which production-only config groups are present.

## Triggering a scoring job

From any app:

```ts
import { Queue } from 'bullmq';
const q = new Queue('scoring-runs', { connection: { url: process.env.REDIS_URL! } });
await q.add('score', {
  session_id: '...',
  reason: 'stage_completed',
  ats: ['greenhouse'],   // optional
});
```

## Ordering & idempotency

- `scores` rows use `ON CONFLICT (session_id) DO UPDATE` — safe to re-run.
- ATS outbox writes one row per (session, provider) per job; re-scoring
  emits a *new* outbox row on purpose so Greenhouse/Lever see the latest
  composite. Consumers should be idempotent on `(session_id, ats)`.
- `audit.log` receives `score.compute`, `memo.generate`/`memo.failed`,
  `ats.outbox.enqueue`/`delivered`/`retry`/`giveup`.
