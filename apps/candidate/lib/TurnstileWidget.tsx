'use client';

import { useEffect, useRef, useState } from 'react';

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: {
        sitekey: string;
        callback?: (token: string) => void;
        'error-callback'?: () => void;
        'expired-callback'?: () => void;
        theme?: 'auto' | 'light' | 'dark';
      }) => string;
      reset: (id?: string) => void;
    };
  }
}

type Status = 'loading' | 'ready' | 'verifying' | 'error';

export function TurnstileWidget({
  resumeToken, siteKey,
}: { resumeToken: string; siteKey: string }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const [status, setStatus] = useState<Status>('loading');
  const [detail, setDetail] = useState<string>();

  useEffect(() => {
    const scriptId = 'cf-turnstile-script';
    if (!document.getElementById(scriptId)) {
      const s = document.createElement('script');
      s.id = scriptId;
      s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
      s.async = true; s.defer = true;
      document.head.appendChild(s);
    }

    let cancelled = false;
    const poll = window.setInterval(() => {
      if (cancelled) return;
      if (!window.turnstile || !hostRef.current) return;
      window.clearInterval(poll);
      try {
        widgetIdRef.current = window.turnstile.render(hostRef.current, {
          sitekey: siteKey,
          theme: 'dark',
          callback: async (token: string) => {
            setStatus('verifying');
            try {
              const r = await fetch('/api/turnstile/verify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token, resume_token: resumeToken }),
                credentials: 'same-origin',
              });
              const j = (await r.json().catch(() => ({}))) as {
                ok?: boolean; redirect?: string; error?: string;
              };
              if (!r.ok || !j.ok || !j.redirect) {
                setStatus('error');
                setDetail(j.error ?? `HTTP ${r.status}`);
                if (widgetIdRef.current) window.turnstile?.reset(widgetIdRef.current);
                return;
              }
              window.location.href = j.redirect;
            } catch (e) {
              setStatus('error');
              setDetail(String(e).slice(0, 200));
            }
          },
          'error-callback': () => { setStatus('error'); setDetail('widget_error'); },
          'expired-callback': () => {
            if (widgetIdRef.current) window.turnstile?.reset(widgetIdRef.current);
          },
        });
        setStatus('ready');
      } catch (e) {
        setStatus('error');
        setDetail(String(e).slice(0, 200));
      }
    }, 100);

    return () => { cancelled = true; window.clearInterval(poll); };
  }, [siteKey, resumeToken]);

  return (
    <div>
      <div ref={hostRef} style={{ minHeight: 65 }} />
      {status === 'loading' && (
        <p style={{ fontSize: 13, color: 'var(--cap-fg-2)', margin: '12px 0 0' }}>
          Loading verification…
        </p>
      )}
      {status === 'verifying' && (
        <p style={{ fontSize: 13, color: 'var(--cap-accent)', margin: '12px 0 0' }}>
          Verifying…
        </p>
      )}
      {status === 'error' && (
        <p style={{ fontSize: 13, color: 'var(--cap-danger)', margin: '12px 0 0' }}>
          Verification failed{detail ? `: ${detail}` : ''}. Refresh to try again.
        </p>
      )}
    </div>
  );
}
