import { fnv1a } from './hash';
import type { EnvSignals } from '../schema';

// All collectors are best-effort and silent on failure. We record *presence*
// of defenses, not sensitive values. Everything runs once per batch cycle.

function canvasHash(): string {
  try {
    const c = document.createElement('canvas');
    c.width = 220; c.height = 40;
    const ctx = c.getContext('2d');
    if (!ctx) return '';
    ctx.textBaseline = 'top';
    ctx.font = '14px "Arial"';
    ctx.fillStyle = '#f60';
    ctx.fillRect(125, 1, 62, 20);
    ctx.fillStyle = '#069';
    ctx.fillText('cap-fp@0,0', 2, 2);
    ctx.fillStyle = 'rgba(102,204,0,0.7)';
    ctx.fillText('cap-fp@4,17', 4, 17);
    return fnv1a(c.toDataURL());
  } catch { return ''; }
}

function webglInfo(): { vendor: string; renderer: string; hash: string } {
  try {
    const c = document.createElement('canvas');
    const gl = (c.getContext('webgl') ?? c.getContext('experimental-webgl')) as WebGLRenderingContext | null;
    if (!gl) return { vendor: '', renderer: '', hash: '' };
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    const vendor   = dbg ? String(gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL)   ?? '') : '';
    const renderer = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) ?? '') : '';
    const params = [
      gl.getParameter(gl.MAX_TEXTURE_SIZE),
      gl.getParameter(gl.MAX_VIEWPORT_DIMS),
      gl.getParameter(gl.MAX_RENDERBUFFER_SIZE),
      gl.getParameter(gl.ALIASED_LINE_WIDTH_RANGE),
      gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE),
      gl.getSupportedExtensions()?.join(','),
    ].join('|');
    return { vendor, renderer, hash: fnv1a(params) };
  } catch { return { vendor: '', renderer: '', hash: '' }; }
}

async function audioHash(): Promise<string> {
  try {
    const Ctor = (window as unknown as { OfflineAudioContext?: typeof OfflineAudioContext }).OfflineAudioContext
      ?? (window as unknown as { webkitOfflineAudioContext?: typeof OfflineAudioContext }).webkitOfflineAudioContext;
    if (!Ctor) return '';
    const ac = new Ctor(1, 5000, 44100);
    const osc = ac.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = 10000;
    const comp = ac.createDynamicsCompressor();
    osc.connect(comp); comp.connect(ac.destination);
    osc.start(0);
    const buf = await ac.startRendering();
    const data = buf.getChannelData(0);
    // Sum first 2500 samples for a stable digest.
    let sum = 0;
    for (let i = 0; i < Math.min(2500, data.length); i++) sum += Math.abs(data[i]!);
    return fnv1a(String(sum));
  } catch { return ''; }
}

function headlessHints(): string[] {
  const hits: string[] = [];
  const nav = navigator as unknown as Record<string, unknown>;
  if (!nav.languages || (Array.isArray(nav.languages) && nav.languages.length === 0)) hits.push('no_langs');
  if ((nav.plugins as { length?: number } | undefined)?.length === 0) hits.push('no_plugins');
  if ((nav.mimeTypes as { length?: number } | undefined)?.length === 0) hits.push('no_mimes');
  if ((window as unknown as Record<string, unknown>)._phantom) hits.push('phantom');
  if ((window as unknown as Record<string, unknown>).callPhantom) hits.push('callPhantom');
  // Puppeteer / Playwright fingerprints that sometimes leak on older versions.
  const k = Object.keys(window).filter((x) => /cdc_|__webdriver|__pw|__nightmare/.test(x));
  if (k.length) hits.push('window_keys');
  if (/HeadlessChrome/i.test(navigator.userAgent)) hits.push('ua_headless');
  return hits.slice(0, 16);
}

function cdpHint(): boolean {
  // The classic trick: getters on Error.stack are invoked by Chrome DevTools
  // when an error is logged. If our getter fires without us logging, CDP is
  // attached. Use a tight budget so false positives are rare.
  let triggered = false;
  try {
    const e = new Error();
    Object.defineProperty(e, 'stack', {
      configurable: true,
      get() { triggered = true; return ''; },
    });
    // Also consult the toString trick used by many detectors.
    void `${e}`;
  } catch { /* ignore */ }
  return triggered;
}

export async function collectEnv(): Promise<EnvSignals> {
  const nav = navigator;
  const screen = window.screen;
  const wg = webglInfo();
  const [canvas, audio] = [canvasHash(), await audioHash()];
  return {
    ua: nav.userAgent,
    platform: (nav as unknown as { platform?: string }).platform ?? '',
    languages: Array.from(nav.languages ?? []).slice(0, 16),
    tz: Intl.DateTimeFormat().resolvedOptions().timeZone ?? '',
    tz_offset: new Date().getTimezoneOffset(),
    screen: {
      w: screen.width, h: screen.height,
      aw: screen.availWidth, ah: screen.availHeight,
      dpr: window.devicePixelRatio ?? 1,
    },
    hw: {
      cores: (nav as unknown as { hardwareConcurrency?: number }).hardwareConcurrency,
      mem: (nav as unknown as { deviceMemory?: number }).deviceMemory,
      touch: 'maxTouchPoints' in nav && (nav as unknown as { maxTouchPoints: number }).maxTouchPoints > 0,
    },
    webdriver: Boolean((nav as unknown as { webdriver?: boolean }).webdriver),
    headless_hints: headlessHints(),
    cdp_hint: cdpHint(),
    plugin_count: nav.plugins?.length ?? 0,
    mime_count: (nav as unknown as { mimeTypes?: { length: number } }).mimeTypes?.length ?? 0,
    fp: {
      canvas,
      webgl_vendor: wg.vendor,
      webgl_renderer: wg.renderer,
      webgl: wg.hash,
      audio,
    },
  };
}
