# phase 10 — anti-AI hardening (web-only, MVP subset)

## What was added

- `.env.example` — Turnstile keys (`NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`)
- `apps/candidate/lib/turnstile.ts` — server verification helper (soft-fail in dev)
- `apps/candidate/lib/TurnstileWidget.tsx` — client widget loader
- `apps/candidate/lib/CanvasPrompt.tsx` — canvas-rendered question text with
  per-item jitter + noise (blocks DOM scraping)
- `apps/candidate/lib/TapSeqPuzzle.tsx` — tap-5-dots-in-order modal puzzle
- `apps/candidate/lib/AntibotBoot.tsx` — now puzzle-aware; renders the modal
  when the server attaches a puzzle to an ingest response
- `apps/candidate/lib/GmaPlayer.tsx` — swaps the text prompt for `CanvasPrompt`
- `apps/candidate/app/s/[token]/route.ts` — Turnstile gate (redirects to
  `/s/[token]/challenge` when enabled + `cap_turnstile` cookie missing)
- `apps/candidate/app/s/[token]/challenge/page.tsx` — challenge page
- `apps/candidate/app/s/[token]/a_gma/page.tsx` — mounts `<AntibotBoot />`
- `apps/candidate/app/api/turnstile/verify/route.ts` — siteverify + issues
  `cap_turnstile` cookie; audit-logs pass/fail
- `apps/candidate/app/api/antibot/ingest/route.ts` — attaches `puzzle` to
  response on `seq === 2` or when 2+ medium/high flags in the batch
- `apps/candidate/middleware.ts` — adds `/s/*/challenge` and
  `/api/turnstile/verify` to public paths

## Apply

```bash
cd /workspaces/candidate-assessment-platform
tar xzf cap-phase10.tar.gz && rm cap-phase10.tar.gz

# no new migrations; no new deps
pnpm typecheck
pnpm dev
```

## Config

Turnstile is off by default (soft-fail). Keys unset → `/s/[token]` mints
`cap_sess` directly, exactly like phase 9. To enable:

```bash
# apps/candidate/.env.local
NEXT_PUBLIC_TURNSTILE_SITE_KEY=0xAAAAAAAAAAAAAAAAA
TURNSTILE_SECRET_KEY=0xBBBBBBBBBBBBBBBBBB
```

CF provides always-pass test keys for local dev:
<https://developers.cloudflare.com/turnstile/troubleshooting/testing/>

## Flow (with Turnstile enabled)

1. `/s/tok_xxx` → route handler sees no `cap_turnstile` cookie → redirects to
   `/s/tok_xxx/challenge`
2. Challenge page loads Turnstile JS, renders widget
3. User solves → widget callback POSTs `{token, resume_token}` to
   `/api/turnstile/verify`
4. Verify endpoint: CF siteverify → sets `cap_turnstile` (1h, httpOnly) →
   returns `{ok, redirect: '/s/tok_xxx'}`
5. Client does `window.location = redirect`
6. `/s/tok_xxx` now passes the Turnstile gate → mints `cap_sess` → redirects
   to the next unfinished stage
7. GMA page mounts `AntibotBoot` → `@cap/antibot/client` starts streaming
   batches to `/api/antibot/ingest`
8. On `seq === 2` the server responds with a `puzzle` → client shows
   `TapSeqPuzzle` modal → user solves or fails → events emitted back through
   the next batch (`puzzle.shown` / `.solved` / `.failed`)

## Puzzle scoring

- `puzzle.failed` already penalized by `@cap/antibot/server/score` (-6,
  severity=high).
- `puzzle.solved` is recorded as telemetry but not rewarded (we don't buy
  back score; clean sessions start near 100).
- Only one puzzle in flight at a time — `AntibotBoot` tracks a ref and
  ignores new server-emitted puzzles until the current one closes.

## Canvas prompts — accessibility trade-off

Question text lives inside a `<canvas>`, unreadable by screen readers and
un-scrapable from the DOM. For production:

- Offer an explicit accessibility mode that swaps in DOM text (gated on
  stronger upstream filtering, e.g. Cloudflare Bot Management score +
  FingerprintJS visitorId).
- Or provide audio-only prompts as an alt path.

MVP ships with canvas-only; `aria-label="Question prompt"` tells assistive
tech a prompt exists without giving its content.

## Smoke test (no Turnstile keys)

```bash
./scripts/new-session.sh
# open printed URL; should redirect straight to /s/<tok>/a_gma
# - prompt text renders as canvas (inspect element; no text in DOM)
# - devtools network tab: POST /api/antibot/ingest every 5s
# - after ~10s (seq=2), tap-seq modal appears
# - tap dots 1..5 in order → modal closes → GMA continues
```

## Smoke test (Turnstile test keys)

```bash
# apps/candidate/.env.local
NEXT_PUBLIC_TURNSTILE_SITE_KEY=1x00000000000000000000AA   # CF always-pass
TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA

./scripts/new-session.sh
# visit URL → /s/<tok>/challenge → widget auto-passes → back to /s/<tok> →
# /s/<tok>/a_gma. cap_turnstile cookie visible in devtools.
```

## Not included (tracked for later phases)

- Webcam ML (face count, gaze, phone detection) — stub events already accepted
  by the scorer; hook MediaPipe/YOLO-nano in a later phase.
- `drag` and `rotate` puzzle kinds — schema supports them, only `tap_seq`
  is implemented. Server only emits `tap_seq` for now.
- FingerprintJS Pro integration — `env.ts` in `@cap/antibot/client` already
  computes canvas/webgl/audio fingerprints; Pro visitorId is a separate
  server-side call.
- Cloudflare WAF + Bot Management edge rules — deployment concern, not code.
- Per-stage Turnstile re-challenge — current implementation challenges once
  per session-entry (1h cookie). Spec asks for "every stage transition";
  deferrable since only one stage has a UI today.
