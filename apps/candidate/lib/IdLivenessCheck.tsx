'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@cap/ui';
import { uploadArtifactDirect } from './direct-upload';

// Random liveness challenges — simple action prompts the candidate performs live.
const CHALLENGES = [
  'Please blink twice slowly.',
  'Please smile at the camera.',
  'Please slowly turn your head to the left, then back to center.',
  'Please slowly turn your head to the right, then back to center.',
  'Please nod your head up and down once.',
];

type Step = 'id_capture' | 'id_preview' | 'liveness_capture' | 'liveness_preview' | 'uploading' | 'done' | 'error';

export function IdLivenessCheck() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [step, setStep] = useState<Step>('id_capture');
  const [idBlob, setIdBlob] = useState<Blob | null>(null);
  const [idPreviewUrl, setIdPreviewUrl] = useState<string | null>(null);
  const [livenessBlob, setLivenessBlob] = useState<Blob | null>(null);
  const [livenessPreviewUrl, setLivenessPreviewUrl] = useState<string | null>(null);
  const [challenge] = useState(() => CHALLENGES[Math.floor(Math.random() * CHALLENGES.length)]);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraError(null);
    } catch {
      setCameraError('Camera access was denied. Please allow camera access and reload.');
    }
  }, []);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => {
    if (step === 'id_capture' || step === 'liveness_capture') {
      void startCamera();
    } else {
      stopCamera();
    }
    return stopCamera;
  }, [step, startCamera, stopCamera]);

  function captureFrame(): Blob | null {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return null;
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0);
    // toBlob is async; we use toDataURL and convert synchronously.
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
    const byteStr = atob(dataUrl.split(',')[1]!);
    const ab = new Uint8Array(byteStr.length);
    for (let i = 0; i < byteStr.length; i++) ab[i] = byteStr.charCodeAt(i);
    return new Blob([ab], { type: 'image/jpeg' });
  }

  function takeIdPhoto() {
    const blob = captureFrame();
    if (!blob) return;
    setIdBlob(blob);
    setIdPreviewUrl(URL.createObjectURL(blob));
    setStep('id_preview');
  }

  function startLiveness() {
    setStep('liveness_capture');
    // After 5s auto-capture; candidate can also press the button.
    let remaining = 5;
    setCountdown(remaining);
    const id = window.setInterval(() => {
      remaining -= 1;
      setCountdown(remaining);
      if (remaining <= 0) {
        window.clearInterval(id);
        setCountdown(null);
        // auto-capture fires via a queued micro-task so the video frame is fresh
        setTimeout(() => takeLivenessPhoto(), 0);
      }
    }, 1000);
  }

  function takeLivenessPhoto() {
    const blob = captureFrame();
    if (!blob) return;
    setLivenessBlob(blob);
    setLivenessPreviewUrl(URL.createObjectURL(blob));
    setStep('liveness_preview');
  }

  async function submit() {
    if (!idBlob || !livenessBlob) return;
    setStep('uploading');

    let idArtifactId: string;
    let livenessArtifactId: string;
    try {
      [idArtifactId, livenessArtifactId] = await Promise.all([
        uploadArtifactDirect({
          kind: 'id_photo',
          blob: idBlob,
          filename: 'id_photo.jpg',
          mimeType: 'image/jpeg',
        }),
        uploadArtifactDirect({
          kind: 'liveness_frame',
          blob: livenessBlob,
          filename: 'liveness_frame.jpg',
          mimeType: 'image/jpeg',
        }),
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed');
      setStep('error');
      return;
    }

    const completeRes = await fetch('/api/stages/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({
        stage_key: 'A_ID_LIVENESS',
        payload: {
          id_artifact_id: idArtifactId,
          liveness_artifact_id: livenessArtifactId,
          challenge,
        },
      }),
    });
    if (!completeRes.ok) {
      const j = await completeRes.json().catch(() => ({})) as { error?: string };
      setError(j.error ?? `Could not complete stage (HTTP ${completeRes.status})`);
      setStep('error');
      return;
    }

    setStep('done');
    const tokenPath = window.location.pathname.replace(/\/a_id_liveness$/, '');
    window.location.href = tokenPath;
  }

  if (step === 'done') {
    return <Status tone="success">Verified. Continuing…</Status>;
  }

  if (step === 'error') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Status tone="danger">{error ?? 'An error occurred.'}</Status>
        <Button variant="secondary" onClick={() => { setStep('id_capture'); setError(null); }}>
          Restart
        </Button>
      </div>
    );
  }

  if (step === 'uploading') {
    return <Status>Verifying identity… please wait.</Status>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Step indicator */}
      <div style={{ display: 'flex', gap: 12, fontSize: 12, color: 'var(--cap-fg-2)' }}>
        <StepDot active={step === 'id_capture' || step === 'id_preview'} done={livenessBlob != null} label="1. ID photo" />
        <span style={{ color: 'var(--cap-border)' }}>→</span>
        <StepDot active={step === 'liveness_capture' || step === 'liveness_preview'} done={false} label="2. Liveness check" />
      </div>

      {cameraError && (
        <div style={{ fontSize: 13, color: 'var(--cap-danger)', padding: '10px 14px',
          background: 'rgba(239,68,68,0.08)', border: '1px solid var(--cap-danger)',
          borderRadius: 'var(--cap-radius-md)' }}>
          {cameraError}
        </div>
      )}

      {/* ID capture */}
      {(step === 'id_capture') && (
        <>
          <Instruction>
            Hold your government-issued ID (passport, driver&apos;s licence, or national ID)
            up to the camera so all text is clearly visible, then press <strong>Take photo</strong>.
          </Instruction>
          <CameraView videoRef={videoRef} />
          <canvas ref={canvasRef} style={{ display: 'none' }} />
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Button variant="primary" disabled={!!cameraError} onClick={takeIdPhoto}>
              Take photo
            </Button>
          </div>
        </>
      )}

      {/* ID preview */}
      {step === 'id_preview' && idPreviewUrl && (
        <>
          <Instruction>Does your ID appear clear and readable?</Instruction>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={idPreviewUrl} alt="ID photo preview"
            style={{ borderRadius: 'var(--cap-radius-md)', border: '1px solid var(--cap-border)', maxWidth: '100%' }} />
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <Button variant="secondary" onClick={() => setStep('id_capture')}>Retake</Button>
            <Button variant="primary" onClick={startLiveness}>Looks good →</Button>
          </div>
        </>
      )}

      {/* Liveness capture */}
      {step === 'liveness_capture' && (
        <>
          <Instruction>
            <strong>Liveness check:</strong> {challenge}
            {countdown != null && (
              <span style={{ marginLeft: 8, fontFamily: 'var(--cap-font-mono)', color: 'var(--cap-accent)' }}>
                Auto-capture in {countdown}s
              </span>
            )}
          </Instruction>
          <CameraView videoRef={videoRef} />
          <canvas ref={canvasRef} style={{ display: 'none' }} />
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Button variant="primary" onClick={takeLivenessPhoto}>Capture now</Button>
          </div>
        </>
      )}

      {/* Liveness preview */}
      {step === 'liveness_preview' && livenessPreviewUrl && (
        <>
          <Instruction>Does this frame look correct?</Instruction>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={livenessPreviewUrl} alt="Liveness frame preview"
            style={{ borderRadius: 'var(--cap-radius-md)', border: '1px solid var(--cap-border)', maxWidth: '100%' }} />
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <Button variant="secondary" onClick={startLiveness}>Retake</Button>
            <Button variant="primary" onClick={submit}>Submit &amp; continue</Button>
          </div>
        </>
      )}
    </div>
  );
}

function CameraView({ videoRef }: { videoRef: React.RefObject<HTMLVideoElement | null> }) {
  return (
    <div style={{
      position: 'relative', borderRadius: 'var(--cap-radius-lg)',
      overflow: 'hidden', background: '#000',
      border: '1px solid var(--cap-border)', aspectRatio: '16/9',
    }}>
      <video ref={videoRef} playsInline muted
        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
    </div>
  );
}

function Instruction({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ margin: 0, fontSize: 14, color: 'var(--cap-fg-2)', lineHeight: 1.6 }}>{children}</p>
  );
}

function StepDot({ active, done, label }: { active: boolean; done: boolean; label: string }) {
  return (
    <span style={{
      color: done ? 'var(--cap-success)' : active ? 'var(--cap-accent)' : 'var(--cap-fg-3, var(--cap-fg-2))',
      fontWeight: active ? 600 : 400,
    }}>
      {done ? '✓ ' : ''}{label}
    </span>
  );
}

function Status({ children, tone = 'default' }: { children: React.ReactNode; tone?: 'default' | 'danger' | 'success' }) {
  const color = tone === 'danger' ? 'var(--cap-danger)' : tone === 'success' ? 'var(--cap-success)' : 'var(--cap-fg-2)';
  return <div style={{ padding: 'var(--cap-space-5)', color, fontSize: 14 }}>{children}</div>;
}
