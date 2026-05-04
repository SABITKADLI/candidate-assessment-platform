import { cookies } from 'next/headers';
import { HeadObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { sql, auditLog } from '@cap/db';
import { z } from 'zod';
import { rateLimit } from '@/lib/rate-limit';
import {
  UPLOAD_CONTRACTS,
  getUploadContract,
  isAllowedMimeType,
  normalizeMimeType,
  type UploadKind,
} from '@/lib/upload-contract';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const zBody = z.object({
  kind: z.enum(Object.keys(UPLOAD_CONTRACTS) as [UploadKind, ...UploadKind[]]),
  key: z.string().min(1).max(600),
  mime_type: z.string().min(1).max(160),
  size_bytes: z.number().int().positive(),
  sha256_hex: z.string().regex(/^[a-f0-9]{64}$/),
});

let client: S3Client | null = null;
function s3() {
  client ??= new S3Client({
    region: process.env.AWS_REGION ?? 'eu-north-1',
    credentials: process.env.AWS_ACCESS_KEY_ID
      ? {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? '',
        }
      : undefined,
  });
  return client;
}

export async function POST(req: Request) {
  const limited = await rateLimit(req, 'upload_complete', 20, 60);
  if (limited) return limited;

  const bucket = process.env.S3_BUCKET;
  if (!bucket) return jsonError('s3_not_configured', 503);

  const parsed = zBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError('bad_shape', 400, parsed.error.message);

  const { kind, key, size_bytes, sha256_hex } = parsed.data;
  const mimeType = normalizeMimeType(parsed.data.mime_type);
  const contract = getUploadContract(kind);
  if (!isAllowedMimeType(contract, mimeType)) return jsonError('bad_type', 400);
  if (size_bytes > contract.maxBytes) return jsonError('file_too_large', 400);

  const sessionId = (await cookies()).get('cap_sess')?.value;
  if (!sessionId) return jsonError('no_session', 401);
  if (!key.startsWith(`${contract.prefix}/${sessionId}/`) || key.includes('..')) {
    return jsonError('bad_key', 400);
  }

  const [session] = await sql<Array<{ id: string; stage: string; status: string }>>`
    SELECT id, stage::text, status::text
    FROM app.sessions
    WHERE id = ${sessionId}::uuid
    LIMIT 1
  `;
  if (!session) return jsonError('no_session', 401);
  if (session.stage !== contract.stageGroup) return jsonError('wrong_stage_group', 400);
  if (['completed', 'expired', 'abandoned', 'disqualified'].includes(session.status)) {
    return jsonError('session_closed', 400);
  }

  const head = await s3().send(new HeadObjectCommand({
    Bucket: bucket,
    Key: key,
    ChecksumMode: 'ENABLED',
  }));
  if (head.ContentLength !== size_bytes) return jsonError('size_mismatch', 400);
  if (normalizeMimeType(head.ContentType ?? '') !== mimeType) return jsonError('type_mismatch', 400);
  if (head.Metadata?.sha256 !== sha256_hex) return jsonError('hash_mismatch', 400);

  const [artifact] = await sql<Array<{ id: string }>>`
    INSERT INTO app.artifacts (session_id, stage_key, kind, s3_key, sha256, size_bytes, mime_type)
    VALUES (
      ${sessionId}::uuid,
      ${contract.stageKey}::app.stage_key,
      ${contract.artifactKind}::app.artifact_kind,
      ${key},
      decode(${sha256_hex}, 'hex'),
      ${size_bytes},
      ${mimeType}
    )
    ON CONFLICT (s3_key) DO UPDATE
      SET sha256 = EXCLUDED.sha256,
          size_bytes = EXCLUDED.size_bytes,
          mime_type = EXCLUDED.mime_type
    RETURNING id
  `;
  if (!artifact) return jsonError('db_error', 500);

  await auditLog('candidate-app', 'artifact.direct_upload.complete', `session:${sessionId}`, {
    kind,
    stage_key: contract.stageKey,
    artifact_id: artifact.id,
    s3_key: key,
    size_bytes,
  });

  return Response.json({ ok: true, artifact_id: artifact.id });
}

function jsonError(error: string, status: number, detail?: string) {
  return Response.json({ error, detail }, { status });
}
