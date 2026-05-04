'use client';

import { useRef, useState } from 'react';
import { Button } from '@cap/ui';
import { uploadArtifactDirect } from './direct-upload';

type Phase =
  | { kind: 'idle' }
  | { kind: 'uploading'; pct: number }
  | { kind: 'completing' }
  | { kind: 'error'; msg: string };

const ACCEPTED = '.pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const MAX_MB = 5;

export function ResumeUploader() {
  const [consented, setConsented] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const inputRef = useRef<HTMLInputElement>(null);
  const dragRef = useRef<HTMLDivElement>(null);

  function pickFile(f: File) {
    if (f.size > MAX_MB * 1024 * 1024) {
      setPhase({ kind: 'error', msg: `File is too large (max ${MAX_MB} MB).` });
      return;
    }
    const ok = f.type === 'application/pdf' ||
      f.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    if (!ok) {
      setPhase({ kind: 'error', msg: 'Only PDF and DOCX files are accepted.' });
      return;
    }
    setFile(f);
    setPhase({ kind: 'idle' });
  }

  async function submit() {
    if (!file || !consented) return;
    setPhase({ kind: 'uploading', pct: 0 });

    const artifactId = await uploadArtifactDirect({
      kind: 'resume',
      blob: file,
      filename: file.name,
      mimeType: file.type,
      onProgress: (pct) => setPhase({ kind: 'uploading', pct }),
    }).catch((e: unknown) => {
      setPhase({ kind: 'error', msg: String(e instanceof Error ? e.message : e) });
      return null;
    });

    if (!artifactId) return;

    setPhase({ kind: 'completing' });
    const res = await fetch('/api/stages/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ stage_key: 'A_RESUME', payload: { artifact_id: artifactId } }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({})) as { error?: string };
      setPhase({ kind: 'error', msg: j.error ?? `HTTP ${res.status}` });
      return;
    }
    // Redirect to session root; the router will pick the next stage.
    const tokenPath = window.location.pathname.replace(/\/a_resume$/, '');
    window.location.href = tokenPath;
  }

  const busy = phase.kind === 'uploading' || phase.kind === 'completing';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* Consent block */}
      <div style={{
        padding: '16px 18px',
        background: 'var(--cap-surface-2, rgba(255,255,255,0.04))',
        border: '1px solid var(--cap-border)',
        borderRadius: 'var(--cap-radius-md)',
        fontSize: 13,
        lineHeight: 1.6,
        color: 'var(--cap-fg-2)',
      }}>
        <p style={{ margin: '0 0 8px', fontWeight: 600, color: 'var(--cap-fg-1)' }}>
          Before you begin
        </p>
        <ul style={{ margin: '0 0 14px', paddingLeft: 18 }}>
          <li>Your activity during this assessment is recorded for security and integrity purposes.</li>
          <li>Your resume and assessment data are stored securely and used only for this hiring process.</li>
          <li>You confirm you are the intended candidate and will complete this assessment independently.</li>
        </ul>
        <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={consented}
            onChange={(e) => setConsented(e.target.checked)}
            disabled={busy}
            style={{ marginTop: 2, accentColor: 'var(--cap-accent)' }}
          />
          <span>
            I have read and agree to the above. I consent to my data being processed for
            employment screening purposes.
          </span>
        </label>
      </div>

      {/* Drop zone */}
      <div
        ref={dragRef}
        onClick={() => !busy && inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); dragRef.current?.setAttribute('data-drag', 'true'); }}
        onDragLeave={() => dragRef.current?.removeAttribute('data-drag')}
        onDrop={(e) => {
          e.preventDefault();
          dragRef.current?.removeAttribute('data-drag');
          const f = e.dataTransfer.files[0];
          if (f) pickFile(f);
        }}
        style={{
          border: `2px dashed ${file ? 'var(--cap-accent)' : 'var(--cap-border)'}`,
          borderRadius: 'var(--cap-radius-lg)',
          padding: '32px 24px',
          textAlign: 'center',
          cursor: busy ? 'not-allowed' : 'pointer',
          transition: 'border-color 150ms ease',
          background: file ? 'var(--cap-accent-muted)' : 'transparent',
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED}
          style={{ display: 'none' }}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) pickFile(f); }}
          disabled={busy}
        />
        {file ? (
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--cap-fg-1)', marginBottom: 4 }}>
              {file.name}
            </div>
            <div style={{ fontSize: 12, color: 'var(--cap-fg-2)' }}>
              {(file.size / 1024).toFixed(0)} KB · {file.type === 'application/pdf' ? 'PDF' : 'DOCX'}
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); setFile(null); setPhase({ kind: 'idle' }); }}
              disabled={busy}
              style={{
                marginTop: 10, fontSize: 12, color: 'var(--cap-fg-2)',
                background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline',
              }}
            >
              Remove
            </button>
          </div>
        ) : (
          <div>
            <div style={{ fontSize: 28, marginBottom: 8 }}>📄</div>
            <div style={{ fontSize: 14, color: 'var(--cap-fg-1)', fontWeight: 500, marginBottom: 4 }}>
              Drop your resume here, or click to browse
            </div>
            <div style={{ fontSize: 12, color: 'var(--cap-fg-2)' }}>PDF or DOCX · max 5 MB</div>
          </div>
        )}
      </div>

      {/* Progress / error feedback */}
      {phase.kind === 'uploading' && (
        <div>
          <div style={{
            height: 4, borderRadius: 2, background: 'var(--cap-border)', overflow: 'hidden',
          }}>
            <div style={{
              height: '100%', borderRadius: 2, background: 'var(--cap-accent)',
              width: `${phase.pct}%`, transition: 'width 200ms ease',
            }} />
          </div>
          <div style={{ marginTop: 6, fontSize: 12, color: 'var(--cap-fg-2)', textAlign: 'right' }}>
            Uploading… {phase.pct}%
          </div>
        </div>
      )}
      {phase.kind === 'completing' && (
        <div style={{ fontSize: 13, color: 'var(--cap-fg-2)' }}>Saving…</div>
      )}
      {phase.kind === 'error' && (
        <div style={{ fontSize: 13, color: 'var(--cap-danger)', padding: '8px 12px',
          background: 'var(--cap-danger-muted, rgba(239,68,68,0.08))',
          border: '1px solid var(--cap-danger)', borderRadius: 'var(--cap-radius-md)' }}>
          {phase.msg}
        </div>
      )}

      {/* Submit */}
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Button
          variant="primary"
          disabled={!consented || !file || busy}
          onClick={submit}
        >
          {busy ? 'Uploading…' : 'Continue'}
        </Button>
      </div>
    </div>
  );
}
