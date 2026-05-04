'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@cap/ui';
import { uploadArtifactDirect } from './direct-upload';

type Phase = 'intro' | 'recording' | 'preview' | 'uploading' | 'done' | 'error';

const QUESTION = 'Listen carefully, then answer aloud: A manager notices that two high-performing team members have recently stopped collaborating and their work quality has declined. What are the most likely root causes, and what steps would you take — in order — to address the situation?';
const MAX_RECORD_SECONDS = 120;

export function VerbalPlayer() {
  const [phase, setPhase] = useState<Phase>('intro');
  const [recTimer, setRecTimer] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [uploadPct, setUploadPct] = useState(0);

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const blobRef = useRef<Blob | null>(null);

  function stopMic() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }

  useEffect(() => () => { stopMic(); }, []);

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];

      const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')
          ? 'audio/ogg;codecs=opus'
          : 'audio/webm';

      const rec = new MediaRecorder(stream, { mimeType: mime });
      recorderRef.current = rec;
      rec.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      rec.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mime });
        blobRef.current = blob;
        setBlobUrl(URL.createObjectURL(blob));
        stopMic();
        setPhase('preview');
      };
      rec.start(500);
      setPhase('recording');

      let elapsed = 0;
      const id = window.setInterval(() => {
        elapsed += 1;
        setRecTimer(elapsed);
        if (elapsed >= MAX_RECORD_SECONDS) { window.clearInterval(id); rec.stop(); }
      }, 1000);
    } catch {
      setErrorMsg('Microphone access denied. Please allow microphone access and try again.');
      setPhase('error');
    }
  }

  function stopRecording() { recorderRef.current?.stop(); }

  async function upload() {
    const blob = blobRef.current;
    if (!blob) return;
    setUploadPct(0);
    setPhase('uploading');

    const ext = blob.type.includes('ogg') ? 'ogg' : 'webm';
    const artifact_id = await uploadArtifactDirect({
      kind: 'verbal_audio',
      blob,
      filename: `response.${ext}`,
      mimeType: blob.type || 'audio/webm',
      onProgress: setUploadPct,
    }).catch((e: unknown) => {
      setErrorMsg(e instanceof Error ? e.message : 'Upload failed');
      setPhase('error');
      return null;
    });
    if (!artifact_id) return;

    const completeRes = await fetch('/api/stages/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ stage_key: 'B_VERBAL', payload: { artifact_id } }),
    });
    if (!completeRes.ok) {
      const j = await completeRes.json().catch(() => ({})) as { error?: string };
      setErrorMsg(j.error ?? `HTTP ${completeRes.status}`);
      setPhase('error');
      return;
    }
    setPhase('done');
    const tokenPath = window.location.pathname.replace(/\/b_verbal$/, '');
    window.location.href = tokenPath;
  }

  if (phase === 'done') return <Status tone="success">Response saved. Continuing…</Status>;
  if (phase === 'uploading') return <Status>Uploading your response… {uploadPct}%</Status>;
  if (phase === 'error') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Status tone="danger">{errorMsg}</Status>
        <Button variant="secondary" onClick={() => setPhase('intro')}>Try again</Button>
      </div>
    );
  }

  const pct = Math.min((recTimer / MAX_RECORD_SECONDS) * 100, 100);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Question card */}
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

      {/* Recording indicator */}
      {phase === 'recording' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--cap-danger)', display: 'inline-block' }} />
            <span style={{ fontFamily: 'var(--cap-font-mono)', fontSize: 14, color: 'var(--cap-fg-1)' }}>
              Recording — {String(Math.floor(recTimer / 60)).padStart(2,'0')}:{String(recTimer % 60).padStart(2,'0')} / {MAX_RECORD_SECONDS / 60}:00
            </span>
          </div>
          <div style={{ height: 4, borderRadius: 2, background: 'var(--cap-border)' }}>
            <div style={{ height: '100%', borderRadius: 2, background: 'var(--cap-danger)', width: `${pct}%`, transition: 'width 1s linear' }} />
          </div>
        </div>
      )}

      {/* Audio playback */}
      {phase === 'preview' && blobUrl && (
        <audio src={blobUrl} controls style={{ width: '100%' }} />
      )}

      {/* Controls */}
      {phase === 'intro' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--cap-fg-2)' }}>
            Read the question, then record your spoken answer (up to <strong>{MAX_RECORD_SECONDS / 60} minutes</strong>). Microphone access required.
          </p>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Button variant="primary" onClick={() => { void startRecording(); }}>Start recording</Button>
          </div>
        </div>
      )}

      {phase === 'recording' && (
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Button variant="primary" onClick={stopRecording}>Stop recording</Button>
        </div>
      )}

      {phase === 'preview' && (
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <Button variant="secondary" onClick={() => { setBlobUrl(null); blobRef.current = null; setRecTimer(0); void startRecording(); }}>Re-record</Button>
          <Button variant="primary" onClick={() => { void upload(); }}>Submit response</Button>
        </div>
      )}
    </div>
  );
}

function Status({ children, tone = 'default' }: { children: React.ReactNode; tone?: 'default' | 'danger' | 'success' }) {
  const color = tone === 'danger' ? 'var(--cap-danger)' : tone === 'success' ? 'var(--cap-success)' : 'var(--cap-fg-2)';
  return <div style={{ padding: 'var(--cap-space-5)', color, fontSize: 14 }}>{children}</div>;
}
