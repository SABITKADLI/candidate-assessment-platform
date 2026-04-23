'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@cap/ui';

type Phase = 'intro' | 'prep' | 'recording' | 'preview' | 'uploading' | 'done' | 'error';

const QUESTION = 'Tell us about a time you had to deliver a project under significant pressure or with major constraints. What was the situation, what did you do, and what was the outcome?';
const PREP_SECONDS = 60;
const MAX_RECORD_SECONDS = 180;

export function AsyncVideoPlayer() {
  const [phase, setPhase] = useState<Phase>('intro');
  const [prepTimer, setPrepTimer] = useState(PREP_SECONDS);
  const [recTimer, setRecTimer] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const blobRef = useRef<Blob | null>(null);

  function stopCamera() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }

  useEffect(() => () => { stopCamera(); }, []);

  async function startPrep() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      streamRef.current = stream;
      if (videoRef.current) { videoRef.current.srcObject = stream; void videoRef.current.play(); }
      setPhase('prep');

      let remaining = PREP_SECONDS;
      const id = window.setInterval(() => {
        remaining -= 1;
        setPrepTimer(remaining);
        if (remaining <= 0) { window.clearInterval(id); startRecording(); }
      }, 1000);
    } catch {
      setErrorMsg('Camera/microphone access denied. Please allow access and try again.');
      setPhase('error');
    }
  }

  function startRecording() {
    const stream = streamRef.current;
    if (!stream) return;
    chunksRef.current = [];
    const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
      ? 'video/webm;codecs=vp9,opus'
      : 'video/webm';
    const rec = new MediaRecorder(stream, { mimeType: mime });
    recorderRef.current = rec;
    rec.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
    rec.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: mime });
      blobRef.current = blob;
      const url = URL.createObjectURL(blob);
      setBlobUrl(url);
      stopCamera();
      setPhase('preview');
    };
    rec.start(1000);
    setPhase('recording');

    let elapsed = 0;
    const id = window.setInterval(() => {
      elapsed += 1;
      setRecTimer(elapsed);
      if (elapsed >= MAX_RECORD_SECONDS) { window.clearInterval(id); rec.stop(); }
    }, 1000);
  }

  function stopRecording() {
    recorderRef.current?.stop();
  }

  async function upload() {
    const blob = blobRef.current;
    if (!blob) return;
    setPhase('uploading');

    const form = new FormData();
    form.append('video', blob, 'response.webm');
    const upRes = await fetch('/api/stages/b_async_video/upload', {
      method: 'POST', credentials: 'same-origin', body: form,
    });
    if (!upRes.ok) {
      const j = await upRes.json().catch(() => ({})) as { error?: string };
      setErrorMsg(j.error ?? `Upload failed: HTTP ${upRes.status}`);
      setPhase('error');
      return;
    }
    const { artifact_id } = await upRes.json() as { artifact_id: string };

    const completeRes = await fetch('/api/stages/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ stage_key: 'B_ASYNC_VIDEO', payload: { artifact_id } }),
    });
    if (!completeRes.ok) {
      const j = await completeRes.json().catch(() => ({})) as { error?: string };
      setErrorMsg(j.error ?? `HTTP ${completeRes.status}`);
      setPhase('error');
      return;
    }
    setPhase('done');
    const tokenPath = window.location.pathname.replace(/\/b_async_video$/, '');
    window.location.href = tokenPath;
  }

  if (phase === 'done') return <Status tone="success">Video saved. Continuing…</Status>;
  if (phase === 'uploading') return <Status>Uploading your response…</Status>;
  if (phase === 'error') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Status tone="danger">{errorMsg}</Status>
        <Button variant="secondary" onClick={() => setPhase('intro')}>Start over</Button>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Question */}
      <div style={{
        padding: '16px 18px',
        background: 'var(--cap-surface-2, rgba(255,255,255,0.04))',
        border: '1px solid var(--cap-border)',
        borderRadius: 'var(--cap-radius-md)',
        fontSize: 14, lineHeight: 1.75, color: 'var(--cap-fg-1)',
      }}>
        <p style={{ margin: '0 0 6px', fontSize: 11, fontWeight: 600, color: 'var(--cap-fg-2)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Question</p>
        <p style={{ margin: 0 }}>{QUESTION}</p>
      </div>

      {/* Video preview / camera */}
      {(phase === 'prep' || phase === 'recording') && (
        <div style={{ position: 'relative', borderRadius: 'var(--cap-radius-lg)', overflow: 'hidden', background: '#000', aspectRatio: '16/9' }}>
          <video ref={videoRef} muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          <div style={{ position: 'absolute', top: 12, right: 14, display: 'flex', gap: 8, alignItems: 'center' }}>
            {phase === 'prep' && (
              <span style={{ fontFamily: 'var(--cap-font-mono)', fontSize: 13, color: 'rgba(255,255,255,0.75)', background: 'rgba(0,0,0,0.5)', padding: '3px 8px', borderRadius: 4 }}>
                Prep: {prepTimer}s
              </span>
            )}
            {phase === 'recording' && (
              <>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--cap-danger)', display: 'inline-block', animation: 'pulse 1s infinite' }} />
                <span style={{ fontFamily: 'var(--cap-font-mono)', fontSize: 13, color: 'rgba(255,255,255,0.9)', background: 'rgba(0,0,0,0.5)', padding: '3px 8px', borderRadius: 4 }}>
                  {String(Math.floor(recTimer / 60)).padStart(2,'0')}:{String(recTimer % 60).padStart(2,'0')} / {MAX_RECORD_SECONDS / 60}:00
                </span>
              </>
            )}
          </div>
        </div>
      )}

      {phase === 'preview' && blobUrl && (
        <video src={blobUrl} controls style={{ width: '100%', borderRadius: 'var(--cap-radius-lg)', background: '#000' }} />
      )}

      {/* Controls */}
      {phase === 'intro' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--cap-fg-2)' }}>
            You will have <strong>{PREP_SECONDS}s</strong> to think, then up to <strong>{MAX_RECORD_SECONDS / 60} minutes</strong> to record your answer. Camera and microphone access required.
          </p>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Button variant="primary" onClick={() => { void startPrep(); }}>Start preparation</Button>
          </div>
        </div>
      )}

      {phase === 'prep' && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 13, color: 'var(--cap-fg-2)' }}>Recording starts automatically when prep time ends.</span>
          <Button variant="secondary" onClick={startRecording}>Skip prep →</Button>
        </div>
      )}

      {phase === 'recording' && (
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Button variant="primary" onClick={stopRecording}>Stop recording</Button>
        </div>
      )}

      {phase === 'preview' && (
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <Button variant="secondary" onClick={() => { setBlobUrl(null); blobRef.current = null; void startPrep(); }}>Re-record</Button>
          <Button variant="primary" onClick={() => { void upload(); }}>Submit video</Button>
        </div>
      )}
    </div>
  );
}

function Status({ children, tone = 'default' }: { children: React.ReactNode; tone?: 'default' | 'danger' | 'success' }) {
  const color = tone === 'danger' ? 'var(--cap-danger)' : tone === 'success' ? 'var(--cap-success)' : 'var(--cap-fg-2)';
  return <div style={{ padding: 'var(--cap-space-5)', color, fontSize: 14 }}>{children}</div>;
}
