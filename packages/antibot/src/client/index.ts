import type { SignalBatch, SignalEvent, IngestResponse } from '../schema.js';
import type { StageKey } from '@cap/shared';
import { collectEnv } from './env.js';
import { DynamicsAggregator } from './dynamics.js';
import { safeNow } from './hash.js';

export interface AntibotClientOptions {
  endpoint?: string;            // default: /api/antibot/ingest
  flushIntervalMs?: number;     // default: 5_000
  envRefreshMs?: number;        // default: 60_000
  maxQueue?: number;            // default: 1000
  // When true, we don't actually send; useful for tests.
  dryRun?: boolean;
  onFlushResponse?: (r: IngestResponse) => void;
}

export class AntibotClient {
  private seq = 0;
  private queue: SignalEvent[] = [];
  private timer: number | null = null;
  private envTimer: number | null = null;
  private nextEnv = true;
  private dyn = new DynamicsAggregator();
  private cleanup: Array<() => void> = [];
  private stageKey: StageKey;
  private opts: Required<Omit<AntibotClientOptions, 'onFlushResponse'>> & Pick<AntibotClientOptions, 'onFlushResponse'>;

  constructor(stageKey: StageKey, opts: AntibotClientOptions = {}) {
    this.stageKey = stageKey;
    this.opts = {
      endpoint: opts.endpoint ?? '/api/antibot/ingest',
      flushIntervalMs: opts.flushIntervalMs ?? 5_000,
      envRefreshMs: opts.envRefreshMs ?? 60_000,
      maxQueue: opts.maxQueue ?? 1000,
      dryRun: opts.dryRun ?? false,
      onFlushResponse: opts.onFlushResponse,
    };
  }

  start(): void {
    this.cleanup.push(this.dyn.attach(document));
    this.wireDom();
    this.wireNet();
    this.wireVis();
    this.wireDevtools();
    this.timer = window.setInterval(() => void this.flush(), this.opts.flushIntervalMs);
    this.envTimer = window.setInterval(() => { this.nextEnv = true; }, this.opts.envRefreshMs);
    // Last-gasp flush on unload — sendBeacon survives pagehide.
    window.addEventListener('pagehide', () => void this.flush(true), { capture: true });
    window.addEventListener('beforeunload', () => void this.flush(true), { capture: true });
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    if (this.envTimer) clearInterval(this.envTimer);
    for (const fn of this.cleanup) fn();
    this.cleanup.length = 0;
  }

  /** Application-level signal hook (stage API can emit answer.submit etc.). */
  emit(k: SignalEvent['k'], p?: SignalEvent['p']): void {
    this.push({ t: Math.round(safeNow()), k, p });
  }

  // --- internal wiring --------------------------------------------------------
  private push(ev: SignalEvent): void {
    if (this.queue.length >= this.opts.maxQueue) this.queue.splice(0, 100); // drop oldest
    this.queue.push(ev);
  }

  private wireDom(): void {
    const on = <K extends keyof DocumentEventMap>(type: K, fn: (e: DocumentEventMap[K]) => void) => {
      document.addEventListener(type, fn as EventListener, { capture: true, passive: true });
      this.cleanup.push(() =>
        document.removeEventListener(type, fn as EventListener, { capture: true }));
    };
    on('paste', (e) => {
      const t = (e as ClipboardEvent).clipboardData;
      this.push({ t: Math.round(safeNow()), k: 'paste',
        p: { len: t?.getData('text')?.length ?? 0, types: t ? Array.from(t.types) : [] } });
    });
    on('copy', () => this.push({ t: Math.round(safeNow()), k: 'copy' }));
    on('cut',  () => this.push({ t: Math.round(safeNow()), k: 'cut' }));
    on('contextmenu', () => this.push({ t: Math.round(safeNow()), k: 'ctx' }));
    // Right-click specifically (mousedown button 2) — some agents fire ctx without it.
    on('mousedown', (e) => {
      if ((e as MouseEvent).button === 2) this.push({ t: Math.round(safeNow()), k: 'rc' });
    });
  }

  private wireVis(): void {
    const vis = () => this.push({ t: Math.round(safeNow()), k: 'visibility',
      p: { state: document.visibilityState, hidden: document.hidden } });
    document.addEventListener('visibilitychange', vis, { capture: true });
    this.cleanup.push(() => document.removeEventListener('visibilitychange', vis, { capture: true }));
    const blur  = () => this.push({ t: Math.round(safeNow()), k: 'blur' });
    const focus = () => this.push({ t: Math.round(safeNow()), k: 'focus' });
    window.addEventListener('blur',  blur,  { capture: true });
    window.addEventListener('focus', focus, { capture: true });
    this.cleanup.push(() => window.removeEventListener('blur',  blur,  { capture: true }));
    this.cleanup.push(() => window.removeEventListener('focus', focus, { capture: true }));
    // Fullscreen drops are suspicious mid-stage.
    const fx = () => {
      if (!document.fullscreenElement) this.push({ t: Math.round(safeNow()), k: 'fullscreen.exit' });
    };
    document.addEventListener('fullscreenchange', fx, { capture: true });
    this.cleanup.push(() => document.removeEventListener('fullscreenchange', fx, { capture: true }));
  }

  private wireNet(): void {
    const on  = () => this.push({ t: Math.round(safeNow()), k: 'net.online' });
    const off = () => this.push({ t: Math.round(safeNow()), k: 'net.offline' });
    window.addEventListener('online',  on,  { capture: true });
    window.addEventListener('offline', off, { capture: true });
    this.cleanup.push(() => window.removeEventListener('online',  on,  { capture: true }));
    this.cleanup.push(() => window.removeEventListener('offline', off, { capture: true }));
  }

  private wireDevtools(): void {
    // Heuristic: devtools open expands window.outer vs inner dimensions.
    // Sample every 2s; emit on transition only to keep noise low.
    let open = false;
    const check = () => {
      const diff =
        (window.outerWidth  - window.innerWidth)  > 160 ||
        (window.outerHeight - window.innerHeight) > 160;
      if (diff !== open) {
        open = diff;
        this.push({ t: Math.round(safeNow()), k: 'dt', p: { open } });
      }
    };
    const id = window.setInterval(check, 2000);
    this.cleanup.push(() => clearInterval(id));
  }

  // --- transport -------------------------------------------------------------
  private async flush(final = false): Promise<void> {
    // Flush dynamics summary first.
    const dyn = this.dyn.flush();
    if (dyn.kd) this.push({ t: Math.round(safeNow()), k: 'kd', p: dyn.kd });
    if (dyn.mm) this.push({ t: Math.round(safeNow()), k: 'mm', p: dyn.mm });

    if (!this.queue.length && !this.nextEnv) return;

    const batch: SignalBatch = {
      seq: this.seq++,
      stage_key: this.stageKey,
      env: this.nextEnv ? await collectEnv() : undefined,
      events: this.queue.splice(0, this.queue.length),
      sent_at: Date.now(),
    };
    this.nextEnv = false;

    if (this.opts.dryRun) return;

    const body = JSON.stringify(batch);
    // sendBeacon for unload-path reliability; fetch otherwise so we can read
    // back the server's response (puzzle triggers, flush_now).
    if (final && 'sendBeacon' in navigator) {
      navigator.sendBeacon(this.opts.endpoint, new Blob([body], { type: 'application/json' }));
      return;
    }
    try {
      const r = await fetch(this.opts.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        credentials: 'same-origin',
        keepalive: true,
      });
      if (r.ok) {
        const j = (await r.json()) as IngestResponse;
        this.opts.onFlushResponse?.(j);
      }
    } catch { /* network glitch; queue keeps retry-free semantics */ }
  }
}
