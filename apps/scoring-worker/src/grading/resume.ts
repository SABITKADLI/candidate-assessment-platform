import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { sql, auditLog } from '@cap/db';
import type { StageAttemptRow } from './types.js';

const MAX_RESUME_CHARS = 24_000;

export type ResumeExtractionStatus =
  | 'extracted'
  | 'missing_artifact'
  | 'unsupported_type'
  | 'extract_failed'
  | 's3_not_configured';

export interface ResumeExtraction {
  status: ResumeExtractionStatus;
  text: string;
  name_guess: string | null;
  artifact_id: string | null;
  mime_type: string | null;
  truncated: boolean;
}

type ArtifactRow = {
  id: string;
  s3_key: string;
  mime_type: string | null;
};

let _s3: S3Client | null = null;
function s3(): S3Client {
  _s3 ??= new S3Client({
    region: process.env.AWS_REGION ?? 'us-east-1',
    credentials: process.env.AWS_ACCESS_KEY_ID
      ? {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? '',
        }
      : undefined,
  });
  return _s3;
}

export async function ensureResumeExtractionForAttempt(attempt: StageAttemptRow): Promise<ResumeExtraction> {
  const existingText = typeof attempt.raw_payload.resume_text === 'string'
    ? attempt.raw_payload.resume_text
    : '';
  if (existingText) {
    return {
      status: readStatus(attempt.raw_payload.resume_extract_status) ?? 'extracted',
      text: existingText,
      name_guess: readString(attempt.raw_payload.resume_name_guess),
      artifact_id: readString(attempt.raw_payload.resume_artifact_id) ?? readString(attempt.raw_payload.artifact_id),
      mime_type: readString(attempt.raw_payload.resume_mime_type),
      truncated: Boolean(attempt.raw_payload.resume_text_truncated),
    };
  }

  const extraction = await extractResumeForSession(attempt.session_id, readString(attempt.raw_payload.artifact_id));
  await mergeExtractionIntoAttempt(attempt.id, extraction);
  return extraction;
}

export async function ensureResumeExtractionForSession(sessionId: string): Promise<ResumeExtraction | null> {
  const [attempt] = await sql<StageAttemptRow[]>`
    SELECT a.id,
           a.session_id,
           a.stage_key::text AS stage_key,
           a.raw_payload,
           a.duration_s,
           a.completed_at,
           a.scoring_status,
           a.scoring_error,
           NULL::text AS role_name,
           NULL::text AS role_description,
           NULL::text AS session_locale
    FROM app.stage_attempts a
    WHERE a.session_id = ${sessionId}::uuid
      AND a.stage_key = 'A_RESUME'::app.stage_key
    ORDER BY a.completed_at DESC NULLS LAST, a.started_at DESC NULLS LAST
    LIMIT 1
  `;
  if (!attempt) return null;
  return ensureResumeExtractionForAttempt(attempt);
}

export async function extractResumeForSession(
  sessionId: string,
  artifactId: string | null,
): Promise<ResumeExtraction> {
  const bucket = process.env.S3_BUCKET;
  if (!bucket) return emptyExtraction('s3_not_configured');

  const artifact = await findResumeArtifact(sessionId, artifactId);
  if (!artifact) return emptyExtraction('missing_artifact');

  try {
    const obj = await s3().send(new GetObjectCommand({ Bucket: bucket, Key: artifact.s3_key }));
    const body = obj.Body as { transformToByteArray?: () => Promise<Uint8Array> } | undefined;
    const bytes = body?.transformToByteArray ? Buffer.from(await body.transformToByteArray()) : Buffer.alloc(0);
    const mimeType = normalizeMime(artifact.mime_type ?? obj.ContentType ?? '');
    const rawText = await extractText(bytes, mimeType);
    const text = normalizeResumeText(rawText);
    const truncated = text.length > MAX_RESUME_CHARS;
    const finalText = truncated ? text.slice(0, MAX_RESUME_CHARS) : text;
    return {
      status: finalText ? 'extracted' : 'extract_failed',
      text: finalText,
      name_guess: guessResumeName(finalText),
      artifact_id: artifact.id,
      mime_type: mimeType,
      truncated,
    };
  } catch (err) {
    await auditLog('scoring-worker', 'resume.extract.failed', `session:${sessionId}`, {
      artifact_id: artifact.id,
      error: err instanceof Error ? err.message.slice(0, 300) : String(err).slice(0, 300),
    }).catch(() => undefined);
    return {
      ...emptyExtraction('extract_failed'),
      artifact_id: artifact.id,
      mime_type: artifact.mime_type,
    };
  }
}

export function guessResumeName(text: string): string | null {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 20);

  for (const line of lines) {
    if (line.length < 3 || line.length > 80) continue;
    if (/@/.test(line)) continue;
    if (/\d{3,}/.test(line)) continue;
    if (/^(resume|curriculum vitae|cv|profile|summary|experience|education|skills)$/i.test(line)) continue;
    const words = line.split(/\s+/).filter(Boolean);
    if (words.length < 2 || words.length > 5) continue;
    if (words.every((word) => /^[A-Za-z][A-Za-z'-]*$/.test(word))) return line;
  }
  return null;
}

async function findResumeArtifact(sessionId: string, artifactId: string | null): Promise<ArtifactRow | null> {
  const rows = artifactId
    ? await sql<ArtifactRow[]>`
        SELECT id, s3_key, mime_type
        FROM app.artifacts
        WHERE id = ${artifactId}::uuid
          AND session_id = ${sessionId}::uuid
          AND kind = 'resume'::app.artifact_kind
        LIMIT 1
      `
    : await sql<ArtifactRow[]>`
        SELECT id, s3_key, mime_type
        FROM app.artifacts
        WHERE session_id = ${sessionId}::uuid
          AND kind = 'resume'::app.artifact_kind
        ORDER BY created_at DESC
        LIMIT 1
      `;
  return rows[0] ?? null;
}

async function extractText(buffer: Buffer, mimeType: string): Promise<string> {
  if (mimeType === 'application/pdf') {
    const pdfParse = (await import('pdf-parse')).default;
    const parsed = await pdfParse(buffer);
    return parsed.text ?? '';
  }
  if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    const mammoth = await import('mammoth');
    const parsed = await mammoth.extractRawText({ buffer });
    return parsed.value ?? '';
  }
  throw new Error(`unsupported resume mime type: ${mimeType || 'unknown'}`);
}

async function mergeExtractionIntoAttempt(attemptId: string, extraction: ResumeExtraction): Promise<void> {
  await sql`
    UPDATE app.stage_attempts
       SET raw_payload = raw_payload || ${sql.json({
         resume_text: extraction.text,
         resume_name_guess: extraction.name_guess,
         resume_extract_status: extraction.status,
         resume_artifact_id: extraction.artifact_id,
         resume_mime_type: extraction.mime_type,
         resume_text_truncated: extraction.truncated,
       } as never)}::jsonb
     WHERE id = ${attemptId}::uuid
  `;
}

function normalizeResumeText(text: string): string {
  return text
    .replace(/\u0000/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim();
}

function normalizeMime(mimeType: string): string {
  return mimeType.split(';', 1)[0]?.trim().toLowerCase() ?? '';
}

function emptyExtraction(status: ResumeExtractionStatus): ResumeExtraction {
  return {
    status,
    text: '',
    name_guess: null,
    artifact_id: null,
    mime_type: null,
    truncated: false,
  };
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function readStatus(value: unknown): ResumeExtractionStatus | null {
  const str = readString(value);
  if (
    str === 'extracted' ||
    str === 'missing_artifact' ||
    str === 'unsupported_type' ||
    str === 'extract_failed' ||
    str === 's3_not_configured'
  ) {
    return str;
  }
  return null;
}
