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

- `SELECT ... FOR UPDATE SKIP LOCKED` — multiple replicas can share the
  queue without double-delivery.
- Signing: `X-Cap-Signature: sha256=hex(hmac_sha256(secret, ts + "." + body))`
  with `X-Cap-Timestamp`. Receivers MUST reject if `abs(now - ts) > 5 min`.
- Giveup after 8 attempts (max 1 h backoff); `last_error` preserved for ops.
- Permanent failure if provider URL is unset (`status=failed`, no retries).

## Env

```
DATABASE_URL=postgres://...
REDIS_URL=redis://...

# Memo (optional)
ANTHROPIC_API_KEY=...
MEMO_MODEL=claude-sonnet-4-6-20250930
AWS_REGION=us-east-1
S3_BUCKET=cap-memos

# ATS (per-provider, optional)
ATS_GREENHOUSE_URL=
ATS_GREENHOUSE_SECRET=
ATS_LEVER_URL=
ATS_LEVER_SECRET=
ATS_WORKDAY_URL=
ATS_WORKDAY_SECRET=
```

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
