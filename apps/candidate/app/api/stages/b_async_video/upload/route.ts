import { cookies } from 'next/headers';
import { createHash, randomUUID } from 'crypto';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { sql, auditLog } from '@cap/db';
import { rateLimit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

const MAX_BYTES = 150 * 1024 * 1024; // 150 MB

export async function POST(req: Request) {
  const limited = await rateLimit(req, 'b_async_video_upload', 5, 60);
  if (limited) return limited;

  const jar = await cookies();
  const sessionId = jar.get('cap_sess')?.value;
  if (!sessionId) return unauthorized();

  const rows = await sql<Array<{ id: string; stage: string; status: string }>>`
    SELECT id, stage::text, status::text
    FROM app.sessions WHERE id = ${sessionId}::uuid LIMIT 1
  `;
  const session = rows[0];
  if (!session) return unauthorized();
  if (session.stage !== 'B') return bad('wrong_stage_group');
  if (['completed','expired','abandoned','disqualified'].includes(session.status)) return bad('session_closed');

  let form: FormData;
  try { form = await req.formData(); } catch { return bad('bad_form'); }

  const file = form.get('video');
  if (!(file instanceof File)) return bad('missing_video');
  if (file.size > MAX_BYTES) return bad('file_too_large', `max ${MAX_BYTES / 1024 / 1024} MB`);

  const buf = Buffer.from(await file.arrayBuffer());
  const hash = createHash('sha256').update(buf).digest('hex');
  const ext = file.type.includes('mp4') ? 'mp4' : 'webm';
  const sid: string = sessionId;
  const filename = `${randomUUID()}.${ext}`;
  const s3Key = `async_video/${sid}/${filename}`;

  const uploadDir = process.env.UPLOAD_DIR ?? join(process.cwd(), '..', '..', '.uploads');
  const dir = join(uploadDir, 'async_video', sid);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, filename), buf);

  const artifacts = await sql<Array<{ id: string }>>`
    INSERT INTO app.artifacts (session_id, stage_key, kind, s3_key, sha256, size_bytes, mime_type)
    VALUES (
      ${sid}::uuid,
      'B_ASYNC_VIDEO'::app.stage_key,
      'video',
      ${s3Key},
      decode(${hash}, 'hex'),
      ${buf.byteLength},
      ${file.type}
    )
    RETURNING id
  `;
  const artifact = artifacts[0];
  if (!artifact) return bad('db_error');

  await auditLog('candidate-app', 'artifact.upload', `session:${sid}`,
    { kind: 'video', artifact_id: artifact.id, bytes: buf.byteLength });

  return Response.json({ ok: true, artifact_id: artifact.id });
}

function bad(reason: string, detail?: string) {
  return new Response(JSON.stringify({ error: reason, detail }), {
    status: 400, headers: { 'Content-Type': 'application/json' },
  });
}
function unauthorized() {
  return new Response(JSON.stringify({ error: 'no_session' }), {
    status: 401, headers: { 'Content-Type': 'application/json' },
  });
}
