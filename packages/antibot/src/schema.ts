import { z } from 'zod';
import { zStageKey } from '@cap/shared';

// --- Passive fingerprint & env signals (sampled on stage entry + every 60s) ---
export const zEnvSignals = z.object({
  ua: z.string().max(512),
  platform: z.string().max(64),
  languages: z.array(z.string().max(16)).max(16),
  tz: z.string().max(64),
  tz_offset: z.number().int(),
  screen: z.object({
    w: z.number().int(), h: z.number().int(),
    aw: z.number().int(), ah: z.number().int(),
    dpr: z.number(),
  }),
  hw: z.object({
    cores: z.number().int().min(0).max(256).optional(),
    mem: z.number().int().min(0).max(4096).optional(),
    touch: z.boolean(),
  }),
  // Presence booleans only — we don't ship actual values.
  webdriver: z.boolean(),
  headless_hints: z.array(z.string().max(32)).max(32),
  cdp_hint: z.boolean(),
  plugin_count: z.number().int().min(0).max(256),
  mime_count: z.number().int().min(0).max(256),
  // Cheap canvas/webgl/audio fingerprints (FNV-1a 32-bit hex).
  fp: z.object({
    canvas: z.string().max(16),
    webgl_vendor: z.string().max(64),
    webgl_renderer: z.string().max(128),
    webgl: z.string().max(16),
    audio: z.string().max(16),
  }),
});
export type EnvSignals = z.infer<typeof zEnvSignals>;

// --- Streaming events (one per user/network/DOM observation) ------------------
// Keep payloads tiny — this is a hot path.
export const zSignalEvent = z.object({
  t: z.number().int().nonnegative(),          // perf.now() ms, monotonic per-page
  k: z.enum([
    'paste', 'copy', 'cut',
    'blur', 'focus',                          // tab/window
    'visibility', 'fullscreen.exit',
    'kd',                                     // keystroke dynamics sample
    'mm',                                     // mouse movement summary
    'rc',                                     // right-click attempt
    'ctx',                                    // contextmenu
    'dt',                                     // devtools heuristic
    'gaze.off', 'gaze.on',
    'face.count', 'face.second',
    'phone',                                  // YOLO-nano hit
    'voice.second',
    'net.online', 'net.offline',
    'puzzle.shown', 'puzzle.solved', 'puzzle.failed',
    'answer.submit',
    'heartbeat',
  ]),
  // Payload shape is per-kind; keep it as a loose bag, validated at ingest.
  p: z.record(z.string(), z.unknown()).optional(),
});
export type SignalEvent = z.infer<typeof zSignalEvent>;

// --- Batch envelope (client -> /api/antibot/ingest) --------------------------
export const zSignalBatch = z.object({
  // Monotonic counter per stage-attempt; server rejects gaps/replays.
  seq: z.number().int().nonnegative(),
  stage_key: zStageKey,
  // Captured once per batch so we can detect spoof drift.
  env: zEnvSignals.optional(),
  events: z.array(zSignalEvent).max(500),
  // Client wall-clock for skew measurement (server stamps authoritative ts).
  sent_at: z.number().int().nonnegative(),
});
export type SignalBatch = z.infer<typeof zSignalBatch>;

// --- Server -> client (rare: configuration pushes, e.g. puzzle trigger) -------
export const zIngestResponse = z.object({
  ok: z.literal(true),
  // Server may ask for a gesture puzzle; client surfaces it in the UI.
  puzzle: z.object({ kind: z.enum(['drag', 'rotate', 'tap_seq', 'word_match', 'math_simple']), seed: z.string() }).optional(),
  // Advisory: if true, client should flush more aggressively.
  flush_now: z.boolean().optional(),
});
export type IngestResponse = z.infer<typeof zIngestResponse>;
