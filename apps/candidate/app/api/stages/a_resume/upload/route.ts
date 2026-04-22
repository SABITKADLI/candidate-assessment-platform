import { cookies } from 'next/headers';
import { sql, auditLog } from '@cap/db';
import { createHash, randomUUID } from 'crypto';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const ALLOWED_TYPES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

export async function POST(req: Request) {
  const jar = await cookies();
  const sessionId = jar.get('cap_sess')?.value;
  if (!sessionId) return unauth();

  const [session] = await sql<Array<{ id: string; stage: string; status: string }>>`
    SELECT id, stage::text, status::text FROM app.sessions
    WHERE id = ${sessionId}::uuid LIMIT 1
  `;
  if (!session || session.stage !== 'A') return unauth();
  if (['completed', 'expired', 'abandoned', 'disqualified'].includes(session.status)) {
    return bad('session_closed');
  }

  let formData: FormData;
  try { formData = await req.formData(); }
  catch { return bad('bad_form'); }

  const file = formData.get('resume');
  if (!(file instanceof File)) return bad('missing_file');
  if (!ALLOWED_TYPES.has(file.type)) return bad('bad_type', 'Only PDF and DOCX are accepted.');
  if (file.size > MAX_BYTES) return bad('file_too_large', 'Maximum file size is 5 MB.');
  if (file.size === 0) return bad('empty_file');

  const buf = Buffer.from(await file.arrayBuffer());
  const hash = createHash('sha256').update(buf).digest('hex');
  const ext = file.type === 'application/pdf' ? 'pdf' : 'docx';
  const filename = `${randomUUID()}.${ext}`;

  // Dev: write to local disk. Prod: swap this block for S3 PutObject.
  const uploadDir = process.env.UPLOAD_DIR ?? join(process.cwd(), '..', '..', '.uploads');
  await mkdir(uploadDir, { recursive: true });
  const localPath = join(uploadDir, filename);
  await writeFile(localPath, buf);

  // s3_key stores the local path in dev; the real S3 key in prod.
  const s3Key = process.env.S3_BUCKET
    ? `resumes/${filename}`
    : localPath;

  const artifacts = await sql<Array<{ id: string }>>`
    INSERT INTO app.artifacts (session_id, kind, s3_key, hash)
    VALUES (${sessionId}::uuid, 'resume', ${s3Key}, ${hash})
    RETURNING id
  `;
  const artifact = artifacts[0];
  if (!artifact) return bad('db_error', 'Failed to create artifact record.');

  await auditLog('candidate-app', 'resume.upload', `session:${sessionId}`, {
    artifact_id: artifact.id, hash, size_bytes: file.size,
  });

  return Response.json({ ok: true, artifact_id: artifact.id });
}

function bad(reason: string, detail?: string) {
  return new Response(JSON.stringify({ error: reason, detail }), {
    status: 400, headers: { 'Content-Type': 'application/json' },
  });
}
function unauth() {
  return new Response(JSON.stringify({ error: 'no_session' }), {
    status: 401, headers: { 'Content-Type': 'application/json' },
  });
}
