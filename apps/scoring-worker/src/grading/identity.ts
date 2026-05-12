import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { sql } from '@cap/db';
import type { GraderResult } from '@cap/graders';
import type { ClaudeContentBlock } from './anthropic.js';
import type { StageAttemptRow } from './types.js';
import { ensureResumeExtractionForSession } from './resume.js';

type ImageArtifact = {
  id: string;
  s3_key: string;
  mime_type: string | null;
  upload_kind: string | null;
};

export type IdentityInput = {
  id_image: IdentityImage | null;
  liveness_image: IdentityImage | null;
  resume_name_guess: string | null;
  challenge: string | null;
};

export type IdentityImage = {
  artifact_id: string;
  s3_key: string;
  media_type: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';
  base64: string;
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

export async function buildIdentityInput(attempt: StageAttemptRow): Promise<IdentityInput> {
  const [idArtifact, livenessArtifact, resume] = await Promise.all([
    findImageArtifact(attempt, 'id_photo', readString(attempt.raw_payload.id_artifact_id)),
    findImageArtifact(attempt, 'liveness_frame', readString(attempt.raw_payload.liveness_artifact_id)),
    ensureResumeExtractionForSession(attempt.session_id).catch(() => null),
  ]);
  const [idImage, livenessImage] = await Promise.all([
    idArtifact ? loadImage(idArtifact).catch(() => null) : Promise.resolve(null),
    livenessArtifact ? loadImage(livenessArtifact).catch(() => null) : Promise.resolve(null),
  ]);

  return {
    id_image: idImage,
    liveness_image: livenessImage,
    resume_name_guess: resume?.name_guess ?? null,
    challenge: readString(attempt.raw_payload.challenge),
  };
}

export function identityFallback(input: IdentityInput): GraderResult {
  const hasImages = Boolean(input.id_image && input.liveness_image);
  return {
    score: hasImages ? 55 : 0,
    subscores: {
      face_match: hasImages ? 55 : 0,
      id_readability: input.id_image ? 55 : 0,
      resume_name_match: input.resume_name_guess ? 50 : 35,
      liveness_plausibility: input.liveness_image ? 55 : 0,
    },
    evidence: [
      input.id_image
        ? { kind: 'frame_ref', value: 'ID image artifact present', refers_to: input.id_image.artifact_id }
        : { kind: 'line_ref', value: 'ID image artifact missing' },
      input.liveness_image
        ? { kind: 'frame_ref', value: 'Liveness frame artifact present', refers_to: input.liveness_image.artifact_id }
        : { kind: 'line_ref', value: 'Liveness frame artifact missing' },
      input.resume_name_guess
        ? { kind: 'line_ref', value: `Resume name guess: ${input.resume_name_guess}` }
        : { kind: 'line_ref', value: 'Resume name unavailable' },
    ],
    confidence: hasImages ? 0.35 : 0.25,
    flags: hasImages ? ['low_confidence'] : ['media_corrupt', 'low_confidence'],
    rationale: hasImages
      ? 'Fallback identity score because Anthropic vision evidence was unavailable or invalid.'
      : 'Identity images were missing, so the stage requires review.',
  };
}

export function buildIdentityVisionPrompt(input: IdentityInput, primary?: GraderResult): {
  system: string;
  user: ClaudeContentBlock[];
} {
  const system = [
    'You are grading ID and liveness verification for a hiring assessment.',
    'Compare the government ID image with the live candidate image.',
    'Also compare the visible ID name, if readable, with the resume name guess.',
    'Do not infer sensitive attributes. Do not identify the person by name beyond text visible on the ID.',
    'Output ONLY a JSON object matching the schema. JSON only.',
  ].join(' ');

  const instruction = `CONTEXT:
Resume name guess: ${input.resume_name_guess ?? 'unknown'}
Liveness challenge shown to candidate: ${input.challenge ?? 'unknown'}

RUBRIC:
- face_match (35 pts): Same person appears in ID portrait and live frame.
- id_readability (20 pts): ID image is clear enough to inspect photo and visible name.
- resume_name_match (25 pts): Visible ID name appears consistent with the resume name guess. If either is unreadable or absent, reduce confidence rather than inventing a mismatch.
- liveness_plausibility (20 pts): Live frame appears to be a real person responding to the capture flow, not a replay, printout, or obviously spoofed image.

INSTRUCTIONS:
- Flag identity_mismatch only when face mismatch or name mismatch is likely from visible evidence.
- Use media_corrupt when an image is unreadable or absent.
- Use low_confidence when evidence is weak or a name cannot be read.
- Be conservative: a likely mismatch should require human review, not automatic rejection.
${primary ? `\nPRIMARY GRADER OUTPUT TO VERIFY:\n${JSON.stringify(primary, null, 2)}\n` : ''}
SCHEMA:
{
  "score": <int 0-100>,
  "subscores": {
    "face_match": <int 0-100>,
    "id_readability": <int 0-100>,
    "resume_name_match": <int 0-100>,
    "liveness_plausibility": <int 0-100>
  },
  "evidence": [{"kind":"quote|line_ref|test_name|timestamp|frame_ref", "value":"...", "refers_to":"..."}],
  "confidence": <float 0-1>,
  "flags": [],
  "rationale": "<<=300 words>"
}`;

  const blocks: ClaudeContentBlock[] = [{ type: 'text', text: instruction }];
  if (input.id_image) {
    blocks.push({ type: 'text', text: 'Image 1: government ID capture.' });
    blocks.push(imageBlock(input.id_image));
  }
  if (input.liveness_image) {
    blocks.push({ type: 'text', text: 'Image 2: live candidate frame.' });
    blocks.push(imageBlock(input.liveness_image));
  }
  return { system, user: blocks };
}

async function findImageArtifact(
  attempt: StageAttemptRow,
  uploadKind: 'id_photo' | 'liveness_frame',
  artifactId: string | null,
): Promise<ImageArtifact | null> {
  const rows = artifactId
    ? await sql<ImageArtifact[]>`
        SELECT id, s3_key, mime_type, upload_kind
        FROM app.artifacts
        WHERE id = ${artifactId}::uuid
          AND session_id = ${attempt.session_id}::uuid
          AND stage_key = ${attempt.stage_key}::app.stage_key
          AND kind = 'liveness'::app.artifact_kind
        LIMIT 1
      `
    : await sql<ImageArtifact[]>`
        SELECT id, s3_key, mime_type, upload_kind
        FROM app.artifacts
        WHERE session_id = ${attempt.session_id}::uuid
          AND stage_key = ${attempt.stage_key}::app.stage_key
          AND kind = 'liveness'::app.artifact_kind
          AND upload_kind = ${uploadKind}
        ORDER BY created_at DESC
        LIMIT 1
      `;
  return rows[0] ?? null;
}

async function loadImage(artifact: ImageArtifact): Promise<IdentityImage | null> {
  const bucket = process.env.S3_BUCKET;
  if (!bucket) return null;
  const mediaType = toImageMediaType(artifact.mime_type);
  if (!mediaType) return null;
  const obj = await s3().send(new GetObjectCommand({ Bucket: bucket, Key: artifact.s3_key }));
  const body = obj.Body as { transformToByteArray?: () => Promise<Uint8Array> } | undefined;
  const bytes = body?.transformToByteArray ? Buffer.from(await body.transformToByteArray()) : Buffer.alloc(0);
  if (!bytes.length) return null;
  return {
    artifact_id: artifact.id,
    s3_key: artifact.s3_key,
    media_type: mediaType,
    base64: bytes.toString('base64'),
  };
}

function imageBlock(image: IdentityImage): ClaudeContentBlock {
  return {
    type: 'image',
    source: {
      type: 'base64',
      media_type: image.media_type,
      data: image.base64,
    },
  };
}

function toImageMediaType(value: string | null): IdentityImage['media_type'] | null {
  const mime = value?.split(';', 1)[0]?.trim().toLowerCase() ?? 'image/jpeg';
  if (mime === 'image/jpeg' || mime === 'image/png' || mime === 'image/gif' || mime === 'image/webp') {
    return mime;
  }
  return null;
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}
