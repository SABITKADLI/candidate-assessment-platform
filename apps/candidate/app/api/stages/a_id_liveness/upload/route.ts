import { cookies } from 'next/headers';
import { sql, auditLog } from '@cap/db';
import { createHash, randomUUID } from 'crypto';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { rateLimit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MAX_BYTES = 4 * 1024 * 1024; // 4 MB per image

export async function POST(req: Request) {
  const limited = await rateLimit(req, 'a_id_liveness_upload', 5, 60);
  if (limited) return limited;

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

  const idPhoto = formData.get('id_photo');
  const livenessFrame = formData.get('liveness_frame');
  if (!(idPhoto instanceof File)) return bad('missing_id_photo');
  if (!(livenessFrame instanceof File)) return bad('missing_liveness_frame');
  if (idPhoto.size > MAX_BYTES || livenessFrame.size > MAX_BYTES) return bad('file_too_large');

  const uploadDir = process.env.UPLOAD_DIR ?? join(process.cwd(), '..', '..', '.uploads');
  await mkdir(uploadDir, { recursive: true });

  const sid: string = sessionId;

  const [idArtifact, livenessArtifact] = await Promise.all([
    saveFrame(sid, idPhoto, uploadDir, 'A_ID_LIVENESS'),
    saveFrame(sid, livenessFrame, uploadDir, 'A_ID_LIVENESS'),
  ]);

  await auditLog('candidate-app', 'id_liveness.upload', `session:${sessionId}`, {
    id_artifact: idArtifact.id,
    liveness_artifact: livenessArtifact.id,
  });

  return Response.json({ ok: true, id_artifact_id: idArtifact.id, liveness_artifact_id: livenessArtifact.id });
}

async function saveFrame(sid: string, file: File, uploadDir: string, stageKey: string) {
  const buf = Buffer.from(await file.arrayBuffer());
  const hash = createHash('sha256').update(buf).digest('hex');
  const filename = `${randomUUID()}.jpg`;
  const localPath = join(uploadDir, filename);
  await writeFile(localPath, buf);
  const s3Key = process.env.S3_BUCKET ? `liveness/${filename}` : localPath;
  const rows = await sql<Array<{ id: string }>>`
    INSERT INTO app.artifacts (session_id, stage_key, kind, s3_key, sha256, size_bytes, mime_type)
    VALUES (
      ${sid}::uuid,
      ${stageKey}::app.stage_key,
      'liveness',
      ${s3Key},
      decode(${hash}, 'hex'),
      ${buf.byteLength},
      'image/jpeg'
    )
    RETURNING id
  `;
  return { id: rows[0]?.id ?? '', hash };
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
