# @cap/antibot

Client-side signal collection + server-side fast scoring.

## Client (`@cap/antibot/client`)

Drop-in module attached to any stage page. Collects:

| Source       | Signals                                                         |
|--------------|-----------------------------------------------------------------|
| Environment  | UA, platform, tz, screen, hw, webdriver, CDP hint, plugin count |
| Fingerprint  | Canvas, WebGL vendor/renderer, audio (FNV-1a)                    |
| Keystrokes   | Dwell + flight distributions (stddev-normalized), no key text    |
| Mouse        | Speed p50/p95, straightness, angle entropy                        |
| Clipboard    | Paste (with size + MIME types), copy, cut                         |
| Window       | Blur/focus, visibility, fullscreen exit                           |
| DevTools     | Heuristic transition detector                                     |
| Network      | Online/offline transitions                                        |
| App signals  | `emit('answer.submit', ...)` from stage code                      |

Transport: batched every 5 s, final flush via `sendBeacon` on `pagehide`.
Events accumulate in a bounded queue (1000 max; oldest dropped).

```tsx
// apps/candidate/app/s/[token]/stage/a_gma/page.tsx
import { AntibotBoot } from '@/lib/AntibotBoot';

export default function Page() {
  return (
    <>
      <AntibotBoot stageKey="A_GMA" />
      {/* … actual stage UI … */}
    </>
  );
}
```

## Server (`@cap/antibot/server`)

`scoreBatch(batch, ctx)` — synchronous, zero-I/O triage:

- Returns `{ delta, flags, hot }`.
- `delta` is clamped to `[-25, +1]` per batch — single batch can't terminate.
- `flags` are `{ severity, reason, details }` ready to insert into `app.proctoring_flags`.

The candidate app's `/api/antibot/ingest` route runs a single transaction:
1. Bulk-inserts events into `telemetry.telemetry_events` (partitioned).
2. Inserts flags into `app.proctoring_flags`.
3. Adjusts `app.scores.proctoring_mult` (clamped to `[0.5, 1.0]`).
4. Tracks the latest env fingerprint on the current stage attempt for drift.

Response is always `{ ok: true }` — we never signal detection to the client.

## Not in this module

- **Webcam ML** (face count, gaze, phone, second-voice). The detector emits
  events (`face.count`, `gaze.off`, `phone`, `voice.second`) via the client's
  `emit()` method; the scoring and persistence are already wired for them.
  MediaPipe + YOLO-nano + ONNX runtime live in the candidate app UI layer.
- **Edge-tier fingerprinting** (FingerprintJS Pro visitorId). We store their
  `fingerprint_hash` on `app.candidates` — separate pipeline.
- **Heavy anomaly detection**. Cross-session outlier analysis runs in a
  background worker consuming `telemetry.telemetry_events`; this module only
  does ingress-time triage.

## Scoring (defaults)

| Reason                  | Δ score | Severity |
|-------------------------|---------|----------|
| `env.headless`          | -10     | critical |
| `env.webdriver`         | -8      | high     |
| `env.cdp_hint`          | -8      | high     |
| `media.phone`           | -8      | high     |
| `puzzle.failed`         | -6      | high     |
| `media.face_multi`      | -6      | high     |
| `media.voice_second`    | -6      | high     |
| `input.kd_robotic`      | -5      | medium   |
| `input.paste_external`  | -4      | medium   |
| `input.mm_straight`     | -4      | medium   |
| `env.tz_ip_mismatch`    | -4      | medium   |
| `env.fp_drift`          | -4      | medium   |
| `env.devtools_open`     | -3      | medium   |
| `media.face_none`       | -3      | medium   |
| `input.paste_large`     | -3      | low      |
| `tab_blur_long`         | -2      | low      |
| `net.offline`           | -1      | info     |

Two+ medium flags cross the human-review threshold via the per-session
multiplier floor. Nothing auto-rejects.
