import { NextResponse } from 'next/server';
import { sql } from '@cap/db';
import { auth0, auth0Configured } from '@/lib/auth0';
import { presignGet } from '@/lib/s3';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ attemptId: string }> },
) {
  if (auth0Configured) {
    const session = await auth0.getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { attemptId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(attemptId)) {
    return NextResponse.json({ error: 'invalid_attempt_id' }, { status: 400 });
  }

  const [attempt] = await sql<Array<{
    id: string; session_id: string; stage_key: string; score: string | null;
    scoring_status: string; raw_payload: unknown;
  }>>`
    SELECT id, session_id, stage_key::text AS stage_key, score::text AS score,
           scoring_status, raw_payload
    FROM app.stage_attempts
    WHERE id = ${attemptId}::uuid
  `;
  if (!attempt) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const [reconciliation] = await sql`
    SELECT * FROM app.score_reconciliations
    WHERE stage_attempt_id = ${attemptId}::uuid
  `;

  const runs = await sql`
    SELECT id, grader_version, model, pass_no, score::text AS score, subscores,
           evidence, confidence::text AS confidence, flags, prompt_hash,
           input_token_count, output_token_count, latency_ms, created_at
    FROM app.score_runs
    WHERE stage_attempt_id = ${attemptId}::uuid
    ORDER BY pass_no ASC, created_at DESC
  `;

  const [transcript] = await sql`
    SELECT status, source_s3_key, transcript_s3_key, text, word_confidence, prosody, completed_at
    FROM app.transcripts
    WHERE stage_attempt_id = ${attemptId}::uuid
    ORDER BY created_at DESC
    LIMIT 1
  `;

  const frameKeys = Array.from({ length: 12 }, (_, index) =>
    `transcripts/${attemptId}/frames/frame-${String(index + 1).padStart(3, '0')}.jpg`);
  const frames = await Promise.all(frameKeys.map(async (key) => ({
    key,
    url: await presignGet(key).catch(() => null),
  })));

  return NextResponse.json({
    attempt,
    reconciliation: reconciliation ?? null,
    runs,
    transcript: transcript ?? null,
    frames: frames.filter((frame) => frame.url),
  });
}
