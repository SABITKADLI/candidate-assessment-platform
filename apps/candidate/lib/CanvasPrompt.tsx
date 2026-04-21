'use client';

import { useEffect, useRef } from 'react';

// Renders question text into a <canvas> with per-item jitter and noise so the
// text isn't scrapable from the DOM. `seed` should be a stable per-question
// identifier so renders are deterministic across reloads of the same question.
//
// Accessibility trade-off: canvas is opaque to screen readers. We set an
// aria-label so assistive tech knows there IS a prompt; we don't expose the
// real text since that would defeat anti-scraping. Production should offer an
// explicit accessibility mode that swaps this for DOM text after stronger
// upstream bot filtering (Cloudflare Bot Management, device fingerprint).

export interface CanvasPromptProps {
  text: string;
  seed: string;
  fontSize?: number;
  lineHeight?: number;
  padding?: number;
}

export function CanvasPrompt({
  text, seed, fontSize = 16, lineHeight = 24, padding = 16,
}: CanvasPromptProps) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;

    // Seeded PRNG (xorshift-ish over FNV-1a of seed). Stable per question.
    let h = 2166136261 >>> 0;
    for (let i = 0; i < seed.length; i++) {
      h ^= seed.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    const rnd = (): number => {
      h = Math.imul(h ^ (h >>> 15), 2246822507);
      h = Math.imul(h ^ (h >>> 13), 3266489909);
      h ^= h >>> 16;
      return (h >>> 0) / 4294967296;
    };

    const render = () => {
      const dpr = window.devicePixelRatio ?? 1;
      const cssWidth = canvas.clientWidth;
      if (cssWidth < 20) return;  // not yet laid out

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // First pass: measure + wrap.
      const scratch = document.createElement('canvas').getContext('2d')!;
      scratch.font = `${fontSize}px "IBM Plex Sans", system-ui, sans-serif`;
      const maxWidth = cssWidth - padding * 2;
      const words = text.split(/\s+/);
      const lines: string[] = [];
      let cur = '';
      for (const w of words) {
        const trial = cur ? `${cur} ${w}` : w;
        if (scratch.measureText(trial).width > maxWidth && cur) {
          lines.push(cur); cur = w;
        } else cur = trial;
      }
      if (cur) lines.push(cur);

      const height = padding * 2 + lines.length * lineHeight;

      // Size the canvas (CSS + backing store for HiDPI).
      canvas.width = Math.round(cssWidth * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // Background (subtle, to match surface-2 in the tokens).
      ctx.fillStyle = 'rgba(30, 37, 53, 0.6)';
      ctx.fillRect(0, 0, cssWidth, height);

      // Text: per-character jitter + rotation.
      ctx.font = `${fontSize}px "IBM Plex Sans", system-ui, sans-serif`;
      ctx.textBaseline = 'middle';
      ctx.fillStyle = 'rgba(232, 234, 240, 0.95)';  // cap-fg-1
      lines.forEach((line, li) => {
        let x = padding;
        const y = padding + li * lineHeight + lineHeight / 2;
        for (const ch of line) {
          const dx = (rnd() - 0.5) * 1.2;
          const dy = (rnd() - 0.5) * 1.2;
          const rot = (rnd() - 0.5) * 0.04;
          const w = ctx.measureText(ch).width;
          ctx.save();
          ctx.translate(x + dx, y + dy);
          ctx.rotate(rot);
          ctx.fillText(ch, 0, 0);
          ctx.restore();
          x += w;
        }
      });

      // Scatter noise pixels (very light, non-obstructing).
      ctx.fillStyle = 'rgba(139, 147, 168, 0.06)';
      const noiseCount = Math.floor((cssWidth * height) / 900);
      for (let i = 0; i < noiseCount; i++) {
        ctx.fillRect(rnd() * cssWidth, rnd() * height, 1, 1);
      }
    };

    render();
    // Re-render on container resize; reset the PRNG each time for stability.
    const ro = new ResizeObserver(() => {
      h = 2166136261 >>> 0;
      for (let i = 0; i < seed.length; i++) {
        h ^= seed.charCodeAt(i);
        h = Math.imul(h, 16777619);
      }
      render();
    });
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [text, seed, fontSize, lineHeight, padding]);

  return (
    <canvas
      ref={ref}
      role="img"
      aria-label="Question prompt"
      style={{
        display: 'block',
        width: '100%',
        background: 'var(--cap-surface-2)',
        borderRadius: 'var(--cap-radius-md)',
        border: '1px solid var(--cap-border)',
      }}
    />
  );
}
