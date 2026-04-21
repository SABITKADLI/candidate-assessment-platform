import type { SignalBatch, SignalEvent, EnvSignals } from '../schema';
import type { FlagSeverity } from '@cap/shared';

// ---- Score model ------------------------------------------------------------
// Each batch yields a list of candidate flags plus a bounded *delta* applied
// to the session-level proctoring score (0..100, lower = worse).
//
// The scoring function is deliberately simple and additive: complex models
// live server-side in a downstream worker that consumes telemetry_events.
// This module's job is fast triage at the ingress path.

export interface FlagDraft {
  severity: FlagSeverity;
  reason: string;
  details: Record<string, unknown>;
}

export interface ScoreOutput {
  delta: number;               // [-25, +1] per batch; server clamps to session
  flags: FlagDraft[];
  // Persist these events (we always store *all* events; scorer only triages).
  // Hot ones are separated so worker logic can dedupe.
  hot: SignalEvent[];
}

const EMPTY: ScoreOutput = { delta: 0, flags: [], hot: [] };

// Thresholds. Tune as real data arrives. Numbers sized so a clean session
// never drifts below ~95 and any 2+ medium flags push below 85 (review gate).
const W = {
  paste_external: { delta: -4, sev: 'medium' as FlagSeverity },
  paste_large:    { delta: -3, sev: 'low' as FlagSeverity,    bytes: 400 },
  tab_blur_long:  { delta: -2, sev: 'low' as FlagSeverity,    ms: 30_000 },
  offline:        { delta: -1, sev: 'info' as FlagSeverity },
  devtools_open:  { delta: -3, sev: 'medium' as FlagSeverity },
  webdriver:      { delta: -8, sev: 'high' as FlagSeverity },
  cdp:            { delta: -8, sev: 'high' as FlagSeverity },
  headless_ua:    { delta: -10, sev: 'critical' as FlagSeverity },
  tz_ip_mismatch: { delta: -4, sev: 'medium' as FlagSeverity },
  kd_robotic:     { delta: -5, sev: 'medium' as FlagSeverity },
  mm_straight:    { delta: -4, sev: 'medium' as FlagSeverity },
  puzzle_failed:  { delta: -6, sev: 'high' as FlagSeverity },
  face_none:      { delta: -3, sev: 'medium' as FlagSeverity },
  face_multi:     { delta: -6, sev: 'high' as FlagSeverity },
  phone:          { delta: -8, sev: 'high' as FlagSeverity },
  voice_second:   { delta: -6, sev: 'high' as FlagSeverity },
  fingerprint_drift: { delta: -4, sev: 'medium' as FlagSeverity },
};

export interface ScoreContext {
  // Server side context; provided by the ingress handler.
  ip_country?: string;          // from edge/CF
  ip_tz?: string;               // derived from IP geo
  prev_fingerprint?: string;    // prior canvas|webgl hash for this session
}

export function scoreBatch(batch: SignalBatch, ctx: ScoreContext = {}): ScoreOutput {
  const out: ScoreOutput = { delta: 0, flags: [], hot: [] };

  // --- environment-derived flags -------------------------------------------
  if (batch.env) {
    const e = batch.env;
    if (e.webdriver) add(out, W.webdriver, 'env.webdriver', { value: true });
    if (e.cdp_hint)  add(out, W.cdp,       'env.cdp_hint', {});
    if (/HeadlessChrome/i.test(e.ua) || e.headless_hints.length >= 2)
      add(out, W.headless_ua, 'env.headless', { ua: redactUa(e.ua), hints: e.headless_hints });

    if (ctx.ip_tz && e.tz && ctx.ip_tz !== e.tz) {
      add(out, W.tz_ip_mismatch, 'env.tz_ip_mismatch', { client_tz: e.tz, ip_tz: ctx.ip_tz });
    }
    if (ctx.prev_fingerprint && fingerprintOf(e) !== ctx.prev_fingerprint) {
      add(out, W.fingerprint_drift, 'env.fp_drift', {});
    }
  }

  // --- event-derived flags --------------------------------------------------
  for (const ev of batch.events) {
    switch (ev.k) {
      case 'paste': {
        const p = (ev.p ?? {}) as { len?: number; types?: string[] };
        const externalish = !!p.types?.some((t) => /text\/(plain|html)/i.test(t));
        if (externalish) {
          add(out, W.paste_external, 'input.paste_external', { len: p.len ?? 0 });
          out.hot.push(ev);
        }
        if ((p.len ?? 0) > W.paste_large.bytes) {
          add(out, W.paste_large, 'input.paste_large', { len: p.len });
        }
        break;
      }
      case 'blur':
      case 'visibility': {
        const hidden = ev.k === 'blur' || (ev.p as { hidden?: boolean } | undefined)?.hidden;
        if (hidden) out.hot.push(ev);        // server worker will compute dwell
        break;
      }
      case 'net.offline':
        add(out, W.offline, 'net.offline', {});
        break;
      case 'dt': {
        const open = (ev.p as { open?: boolean } | undefined)?.open;
        if (open) add(out, W.devtools_open, 'env.devtools_open', {});
        break;
      }
      case 'kd': {
        const p = (ev.p ?? {}) as { dwell_stddev_norm?: number; flight_stddev_norm?: number; n?: number };
        // Humans rarely sit below ~0.15 normalized stddev across 30+ samples.
        if ((p.n ?? 0) >= 30 &&
            (p.dwell_stddev_norm ?? 1) < 0.08 &&
            (p.flight_stddev_norm ?? 1) < 0.08) {
          add(out, W.kd_robotic, 'input.kd_robotic', p);
        }
        break;
      }
      case 'mm': {
        const p = (ev.p ?? {}) as { straightness?: number; angle_entropy?: number; n?: number };
        if ((p.n ?? 0) >= 32 && (p.straightness ?? 0) > 0.92 && (p.angle_entropy ?? 4) < 1.5) {
          add(out, W.mm_straight, 'input.mm_straight', p);
        }
        break;
      }
      case 'face.second':  add(out, W.face_multi, 'media.face_multi', {}); break;
      case 'face.count':   {
        const c = (ev.p as { count?: number } | undefined)?.count ?? 1;
        if (c === 0) add(out, W.face_none, 'media.face_none', {});
        if (c > 1)  add(out, W.face_multi, 'media.face_multi', { count: c });
        break;
      }
      case 'phone':        add(out, W.phone, 'media.phone', {}); break;
      case 'voice.second': add(out, W.voice_second, 'media.voice_second', {}); break;
      case 'puzzle.failed':add(out, W.puzzle_failed, 'puzzle.failed', {}); break;
      default: /* ignore */ break;
    }
  }

  // Clamp: a single batch can't swing more than -25.
  out.delta = Math.max(-25, Math.min(1, out.delta));
  return out;
}

function add(out: ScoreOutput, w: { delta: number; sev: FlagSeverity }, reason: string, details: Record<string, unknown>) {
  out.delta += w.delta;
  out.flags.push({ severity: w.sev, reason, details });
}

function fingerprintOf(e: EnvSignals): string {
  return [e.fp.canvas, e.fp.webgl, e.fp.audio].join('|');
}

function redactUa(ua: string): string { return ua.slice(0, 120); }

// Re-export for convenience.
export type { SignalBatch, SignalEvent };
export { EMPTY };
