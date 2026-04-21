import { safeNow } from './hash.js';

// Per-keystroke dwell (down->up) and flight (down->next down) time samples.
// We do not ship the keys themselves. Aggregation is per-batch: we emit a
// compact summary rather than raw samples to keep payloads small.

interface KdSample { dwell: number; flight: number }
interface MmSample { dt: number; dx: number; dy: number }

export class DynamicsAggregator {
  private kd: KdSample[] = [];
  private mm: MmSample[] = [];
  private lastDown = new Map<string, number>();   // code -> t
  private lastDownT = 0;                          // for flight
  private lastMm = { t: 0, x: 0, y: 0 };
  private cap = 2000;

  attach(target: Window | Document): () => void {
    const onDown = (e: KeyboardEvent) => {
      // Modifier-only events are noisy; skip.
      if (e.key.length === 1 || /^(Enter|Tab|Space|Backspace)$/.test(e.code)) {
        const t = safeNow();
        this.lastDown.set(e.code, t);
        if (this.lastDownT) {
          const flight = t - this.lastDownT;
          if (flight >= 0 && flight < 5000) this.pushKd({ dwell: 0, flight });
        }
        this.lastDownT = t;
      }
    };
    const onUp = (e: KeyboardEvent) => {
      const down = this.lastDown.get(e.code);
      if (down == null) return;
      const dwell = safeNow() - down;
      this.lastDown.delete(e.code);
      if (dwell >= 0 && dwell < 2000) {
        const prev = this.kd[this.kd.length - 1];
        if (prev && prev.dwell === 0) prev.dwell = dwell;   // attach to the pending flight
        else this.pushKd({ dwell, flight: 0 });
      }
    };
    const onMove = (e: MouseEvent) => {
      const t = safeNow();
      if (this.lastMm.t) {
        const dt = t - this.lastMm.t;
        if (dt > 0 && dt < 1000) {
          this.pushMm({ dt, dx: e.clientX - this.lastMm.x, dy: e.clientY - this.lastMm.y });
        }
      }
      this.lastMm = { t, x: e.clientX, y: e.clientY };
    };
    (target as Document).addEventListener('keydown', onDown as EventListener, { capture: true, passive: true });
    (target as Document).addEventListener('keyup', onUp as EventListener, { capture: true, passive: true });
    (target as Document).addEventListener('mousemove', onMove as EventListener, { capture: true, passive: true });
    return () => {
      (target as Document).removeEventListener('keydown', onDown as EventListener, { capture: true });
      (target as Document).removeEventListener('keyup', onUp as EventListener, { capture: true });
      (target as Document).removeEventListener('mousemove', onMove as EventListener, { capture: true });
    };
  }

  private pushKd(s: KdSample) { if (this.kd.length < this.cap) this.kd.push(s); }
  private pushMm(s: MmSample) { if (this.mm.length < this.cap) this.mm.push(s); }

  /**
   * Emit a single summary signal per batch. We return distribution summaries,
   * not raw samples. Super-consistent humans exist; super-consistent timing
   * across all users in a tenant is a red flag the server aggregates.
   */
  flush(): { kd?: Record<string, number>; mm?: Record<string, number> } {
    const out: { kd?: Record<string, number>; mm?: Record<string, number> } = {};
    if (this.kd.length >= 8) {
      const dwell = this.kd.map((s) => s.dwell).filter((x) => x > 0);
      const flight = this.kd.map((s) => s.flight).filter((x) => x > 0);
      out.kd = {
        n: this.kd.length,
        dwell_p50: percentile(dwell, 50),
        dwell_p95: percentile(dwell, 95),
        dwell_stddev_norm: stddev(dwell) / Math.max(1, mean(dwell)),
        flight_p50: percentile(flight, 50),
        flight_p95: percentile(flight, 95),
        flight_stddev_norm: stddev(flight) / Math.max(1, mean(flight)),
      };
    }
    if (this.mm.length >= 16) {
      const speeds = this.mm.map((s) => Math.hypot(s.dx, s.dy) / Math.max(1, s.dt));
      const angles = this.mm.map((s) => Math.atan2(s.dy, s.dx));
      out.mm = {
        n: this.mm.length,
        speed_p50: percentile(speeds, 50),
        speed_p95: percentile(speeds, 95),
        straightness: straightness(this.mm),       // 1 == perfectly straight lines (bot-like)
        angle_entropy: shannonAngleEntropy(angles),
      };
    }
    this.kd.length = 0;
    this.mm.length = 0;
    return out;
  }
}

// --- tiny stats, inlined ------------------------------------------------------
function mean(a: number[]) { return a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0; }
function stddev(a: number[]) {
  if (a.length < 2) return 0;
  const m = mean(a);
  return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1));
}
function percentile(a: number[], p: number) {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  const i = Math.min(s.length - 1, Math.floor((p / 100) * s.length));
  return s[i]!;
}
function straightness(mm: { dx: number; dy: number }[]) {
  let disp = 0, path = 0, x = 0, y = 0;
  for (const s of mm) { x += s.dx; y += s.dy; path += Math.hypot(s.dx, s.dy); }
  disp = Math.hypot(x, y);
  return path ? disp / path : 0;
}
function shannonAngleEntropy(angles: number[]) {
  const bins = new Array(16).fill(0) as number[];
  for (const a of angles) {
    const idx = Math.floor(((a + Math.PI) / (2 * Math.PI)) * 16) % 16;
    bins[idx]!++;
  }
  const total = angles.length || 1;
  let h = 0;
  for (const b of bins) {
    if (!b) continue;
    const p = b / total;
    h -= p * Math.log2(p);
  }
  return h;                     // 4.0 max (uniform over 16 bins)
}
