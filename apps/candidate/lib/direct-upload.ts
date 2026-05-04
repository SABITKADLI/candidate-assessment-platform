'use client';

import type { UploadKind } from './upload-contract';

type PresignResponse = {
  upload_url: string;
  key: string;
  headers: Record<string, string>;
};

type CompleteResponse = {
  ok: true;
  artifact_id: string;
};

export async function uploadArtifactDirect({
  kind,
  blob,
  filename,
  mimeType,
  onProgress,
}: {
  kind: UploadKind;
  blob: Blob;
  filename: string;
  mimeType?: string;
  onProgress?: (pct: number) => void;
}): Promise<string> {
  const contentType = mimeType || blob.type || 'application/octet-stream';
  const hashes = await sha256(blob);

  const presign = await postJson<PresignResponse>('/api/uploads/presign', {
    kind,
    filename,
    mime_type: contentType,
    size_bytes: blob.size,
    sha256_hex: hashes.hex,
  });

  await putToS3(presign.upload_url, blob, presign.headers, onProgress);

  const complete = await postJson<CompleteResponse>('/api/uploads/complete', {
    kind,
    key: presign.key,
    mime_type: contentType,
    size_bytes: blob.size,
    sha256_hex: hashes.hex,
  });

  return complete.artifact_id;
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = payload as { error?: string; detail?: string };
    throw new Error(err.detail ?? err.error ?? `HTTP ${res.status}`);
  }
  return payload as T;
}

async function putToS3(
  url: string,
  blob: Blob,
  headers: Record<string, string>,
  onProgress?: (pct: number) => void,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    for (const [key, value] of Object.entries(headers)) xhr.setRequestHeader(key, value);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress?.(Math.round((event.loaded / event.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`S3 upload failed (HTTP ${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error('S3 upload failed due to a network error'));
    xhr.send(blob);
  });
}

async function sha256(blob: Blob): Promise<{ hex: string }> {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer()));
  let hex = '';
  for (const byte of bytes) {
    hex += byte.toString(16).padStart(2, '0');
  }
  return { hex };
}
