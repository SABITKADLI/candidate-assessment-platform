import { NextResponse } from 'next/server';
import { z } from 'zod';
import { sql, auditLog } from '@cap/db';
import { requireReviewer } from '@/lib/reviewer';
import { enqueueSessionFinalize } from '@/lib/queues';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const zBody = z.object({
  score: z.number().min(0).max(100),
  reason: z.string().min(8).max(2000),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ attemptId: string }> },
) {
  let reviewer;
  try {
    reviewer = await requireReviewer();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { attemptId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(attemptId)) {
    return NextResponse.json({ error: 'invalid_attempt_id' }, { status: 400 });
  }
  const parsed = zBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'bad_shape', issues: parsed.error.issues }, { status: 400 });

  const [attempt] = await sql<Array<{ session_id: string; stage_key: string }>>`
    SELECT session_id, stage_key::text AS stage_key
    FROM app.stage_attempts
    WHERE id = ${attemptId}::uuid
  `;
  if (!attempt) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  await sql.begin(async (tx) => {
    await tx`
      UPDATE app.score_reconciliations
         SET override_score = ${parsed.data.score},
             override_reason = ${parsed.data.reason},
             reviewed_by = ${reviewer.id}::uuid,
             reviewed_at = now(),
             needs_review = false,
             review_reason = NULL,
             updated_at = now()
       WHERE stage_attempt_id = ${attemptId}::uuid
    `;
    await tx`
      UPDATE app.stage_attempts
         SET score = ${parsed.data.score},
             scoring_status = 'final',
             scoring_error = NULL,
             scored_at = now()
       WHERE id = ${attemptId}::uuid
    `;
  });

  await auditLog(reviewer.actor, 'grader.override', `stage_attempt:${attemptId}`, {
    score: parsed.data.score,
    reason: parsed.data.reason,
    stage_key: attempt.stage_key,
  });
  const jobId = await enqueueSessionFinalize({ session_id: attempt.session_id, reason: 'manual_rescore' });

  return NextResponse.json({ ok: true, job_id: jobId });
}
