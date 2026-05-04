import { cookies } from 'next/headers';
import { randomUUID } from 'crypto';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { sql } from '@cap/db';
import { z } from 'zod';
import { rateLimit } from '@/lib/rate-limit';
import {
  UPLOAD_CONTRACTS,
  extensionForMimeType,
  getUploadContract,
  isAllowedMimeType,
  normalizeMimeType,
  type UploadKind,
} from '@/lib/upload-contract';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const zBody = z.object({
  kind: z.enum(Object.keys(UPLOAD_CONTRACTS) as [UploadKind, ...UploadKind[]]),
  filename: z.string().min(1).max(240),
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
  const limited = await rateLimit(req, 'upload_presign', 20, 60);
  if (limited) return limited;

  const bucket = process.env.S3_BUCKET;
  if (!bucket) return jsonError('s3_not_configured', 503);

  const parsed = zBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError('bad_shape', 400, parsed.error.message);

  const { kind, size_bytes, sha256_hex } = parsed.data;
  const mimeType = normalizeMimeType(parsed.data.mime_type);
  const contract = getUploadContract(kind);
  if (!isAllowedMimeType(contract, mimeType)) return jsonError('bad_type', 400);
  if (size_bytes > contract.maxBytes) return jsonError('file_too_large', 400);

  const sessionId = (await cookies()).get('cap_sess')?.value;
  if (!sessionId) return jsonError('no_session', 401);

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

  const extension = extensionForMimeType(contract, mimeType);
  const key = `${contract.prefix}/${sessionId}/${randomUUID()}.${extension}`;
  const checksumBase64 = Buffer.from(sha256_hex, 'hex').toString('base64');

  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    ContentType: mimeType,
    ContentLength: size_bytes,
    ChecksumSHA256: checksumBase64,
    Metadata: {
      sha256: sha256_hex,
      'session-id': sessionId,
      'upload-kind': kind,
    },
  });

  const uploadUrl = await getSignedUrl(s3(), command, { expiresIn: 15 * 60 });

  return Response.json({
    upload_url: uploadUrl,
    key,
    expires_in: 15 * 60,
    headers: {
      'Content-Type': mimeType,
    },
  });
}

function jsonError(error: string, status: number, detail?: string) {
  return Response.json({ error, detail }, { status });
}
