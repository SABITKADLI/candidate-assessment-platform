import { cookies } from 'next/headers';
import { randomUUID } from 'crypto';
import { sql, auditLog } from '@cap/db';
import { enqueueSandbox } from '@/lib/queues';
import { B_DEBUG_PROBLEM } from '@/lib/coding-problems';
import { rateLimit } from '@/lib/rate-limit';
import { z } from 'zod';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const zBody = z.object({
  code: z.string().min(1).max(50_000),
  language: z.enum(['python', 'node']).default('python'),
});

const STAGE_B_ORDER = [
  'B_CODING', 'B_DEBUG', 'B_WORK_SAMPLE', 'B_ASYNC_VIDEO', 'B_VERBAL',
] as const;

export async function POST(req: Request) {
  try {
    return await handlePost(req);
  } catch (err) {
    console.error('[b_debug_submit] unhandled error', err);
    return serverError('submit_failed');
  }
}

async function handlePost(req: Request) {
  const limited = await rateLimit(req, 'b_debug_submit', 15, 60);
  if (limited) return limited;

  let body: unknown;
  try { body = await req.json(); } catch { return bad('bad_json'); }
  const parsed = zBody.safeParse(body);
  if (!parsed.success) return bad('bad_shape', parsed.error.message);
  const { code, language } = parsed.data;

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
  if (['completed','expired','abandoned','disqualified'].includes(session.status)) {
    return bad('session_closed');
  }

  const problem = B_DEBUG_PROBLEM;
  const sid: string = sessionId;

  const attempts = await sql<Array<{ id: string }>>`
    INSERT INTO app.stage_attempts (
      session_id, stage_key, attempt_no, raw_payload, started_at
    ) VALUES (
      ${sid}::uuid, 'B_DEBUG'::app.stage_key, 1,
      ${sql.json({ code, language, problem_id: problem.id }) as never},
      now()
    )
    ON CONFLICT (session_id, stage_key, attempt_no) DO UPDATE
      SET raw_payload  = app.stage_attempts.raw_payload || EXCLUDED.raw_payload,
          score        = NULL,
          duration_s   = NULL,
          started_at   = COALESCE(app.stage_attempts.started_at, EXCLUDED.started_at)
    RETURNING id
  `;
  const attempt = attempts[0];
  if (!attempt) return bad('db_error');

  let sandboxJobId: string | null;
  try {
    sandboxJobId = await enqueueSandbox({
      stage_attempt_id: attempt.id,
      session_id: sid,
      stage_key: 'B_DEBUG',
      run: {
        id: randomUUID(),
        language,
        files: [{ path: 'solution.py', content: code }],
        tests: problem.testFiles,
        test_cmd: problem.testCmd,
        timeout_ms: problem.timeoutMs,
        memory_mb: problem.memoryMb,
      },
    });
    if (!sandboxJobId) throw new Error('sandbox_queue_not_configured');
  } catch (err) {
    console.error('[b_debug_submit] sandbox enqueue failed', err);
    await auditLog('candidate-app', 'sandbox.enqueue.failed', `stage_attempt:${attempt.id}`, {
      stage_key: 'B_DEBUG',
      reason: publicErrorDetail(err),
    }).catch(() => undefined);
    const reason = publicErrorDetail(err);
    return unavailable(
      'sandbox_enqueue_failed',
      `Could not enqueue the debug evaluation. ${reason}`,
    );
  }

  await sql`
    UPDATE app.stage_attempts
       SET completed_at = now(),
           raw_payload = raw_payload || ${sql.json({ sandbox_job_id: sandboxJobId } as never)}
     WHERE id = ${attempt.id}::uuid
  `;

  const doneRows = await sql<Array<{ done: boolean }>>`
    SELECT (
      SELECT count(*) FROM app.stage_attempts
       WHERE session_id = ${sid}::uuid
         AND stage_key = ANY(${STAGE_B_ORDER}::app.stage_key[])
         AND completed_at IS NOT NULL
    ) = ${STAGE_B_ORDER.length} AS done
  `;
  if (doneRows[0]?.done) {
    await sql`
      UPDATE app.sessions
         SET status = 'completed', completed_at = now(), updated_at = now()
       WHERE id = ${sid}::uuid AND status <> 'completed'
    `;
  }

  await auditLog('candidate-app', 'stage.complete', `session:${sid}`, {
    stage_key: 'B_DEBUG',
    stage_group_done: doneRows[0]?.done ?? false,
    sandbox_job_id: sandboxJobId,
  });

  return Response.json({ ok: true, sandbox_job_id: sandboxJobId });
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
function unavailable(reason: string, detail?: string) {
  return new Response(JSON.stringify({ error: reason, detail }), {
    status: 503, headers: { 'Content-Type': 'application/json' },
  });
}
function serverError(reason: string) {
  return new Response(JSON.stringify({ error: reason }), {
    status: 500, headers: { 'Content-Type': 'application/json' },
  });
}
function publicErrorDetail(err: unknown): string {
  return err instanceof Error ? err.message.slice(0, 240) : String(err).slice(0, 240);
}
