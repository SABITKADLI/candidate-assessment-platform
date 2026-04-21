# phase 9 — first stage UI (GMA)

## What was added
- `db/migrations/0006_gma_items.sql` — item bank + 15 seed items
- `apps/candidate/lib/stage-complete.ts` — shared server helper; idempotent
  stage completion + group detection + scoring enqueue
- `apps/candidate/lib/gma.ts` — server-side GMA: session progress, item
  selection, shuffled choices, grading, auto-terminate on deadline
- `apps/candidate/app/api/stages/a_gma/next/route.ts` — the only endpoint
  the player talks to: submit an answer, receive the next question or `done`
- `apps/candidate/lib/GmaPlayer.tsx` — client player: countdown, choice
  selection, submit loop
- `apps/candidate/app/s/[token]/a_gma/page.tsx` — server-gated GMA page
- `apps/candidate/app/s/[token]/page.tsx` — router: send to first
  unfinished stage that has a UI
- `scripts/new-session.sh` — one-shot dev session creator

## Apply

```bash
cd /workspaces/candidate-assessment-platform
tar xzf cap-phase9.tar.gz && rm cap-phase9.tar.gz

# migration
export PGPASSWORD=cap
psql -h 127.0.0.1 -U cap -d cap_dev -v ON_ERROR_STOP=1 -f db/migrations/0006_gma_items.sql

chmod +x scripts/new-session.sh

pnpm typecheck
pnpm dev
```

## End-to-end smoke

```bash
# in one terminal: pnpm dev
# in another:
./scripts/new-session.sh
# -> http://localhost:3000/s/tok_xxxxxxxxxxxxxxxx

# open that URL in a browser. You'll be redirected to /s/<tok>/a_gma.
# Answer 10 questions (or wait 12 min). On finish, you'll see a summary.
```

## What actually happens on finish

1. Client POSTs the last answer to `/api/stages/a_gma/next`.
2. Server records it, grades all answers, computes `score = correct/total*100`.
3. Server calls `completeStage(...)` which:
   - Upserts the `stage_attempts` row with `score` + `completed_at`.
   - Detects the full Stage-A group (only A_GMA has a UI yet; others haven't
     completed, so **`stage_group_done` will be false** unless you manually
     insert completed rows for the other A_* stages).
   - Enqueues a `scoring-runs` BullMQ job IFF group is done.
4. Client renders "Stage complete. X of Y correct. Score: Z."

## To see the composite land in recruiter

Because only A_GMA has a real UI, end-to-end composite requires faking the
other A_* stages. Quick way:

```sql
-- after GMA is complete, fake the rest of Stage A:
INSERT INTO app.stage_attempts (session_id, stage_key, attempt_no, score, completed_at, started_at)
SELECT s.id, k::app.stage_key, 1, 70, now(), now()
FROM app.sessions s
CROSS JOIN unnest(ARRAY['A_RESUME','A_ID_LIVENESS','A_BIG5','A_MBTI','A_RORSCHACH','A_INTEGRITY','A_SJT']) AS k
WHERE s.id = '<session_uuid>'
ON CONFLICT DO NOTHING;

-- then trigger scoring directly (since no BullMQ in dev without Redis URL in candidate):
UPDATE app.sessions SET status = 'completed', completed_at = now() WHERE id = '<session_uuid>';
```

If you set `REDIS_URL` in `apps/candidate/.env.local` too, the handler will
actually enqueue the job and the scoring-worker (also Redis-gated) will pick
it up and compute the composite.

## Known MVP limits
- 15-item bank; `GMA_N_ITEMS = 10`. Swap both for production.
- Choice order is shuffled per session, but the bank itself is tiny so item
  repeat across sessions is certain.
- No canvas-rendered prompts yet (anti-scraping) — plain text. Tracked for
  the Cloudflare/FingerprintJS phase.
- No per-question timer; only the global 12-minute cap.
