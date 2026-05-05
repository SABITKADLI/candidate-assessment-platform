import { NextResponse } from 'next/server';
import { z } from 'zod';
import { sql, auditLog } from '@cap/db';
import { requireReviewer } from '@/lib/reviewer';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const zBody = z.object({
  attempt_ids: z.array(z.string().uuid()).min(1).max(100),
  assigned_to: z.string().uuid().optional(),
});

export async function POST(req: Request) {
  let reviewer;
  try {
    reviewer = await requireReviewer();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const parsed = zBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'bad_shape', issues: parsed.error.issues }, { status: 400 });
  const assignee = parsed.data.assigned_to ?? reviewer.id;

  await sql`
    UPDATE app.score_reconciliations
       SET assigned_to = ${assignee}::uuid,
           assigned_at = now(),
           updated_at = now()
     WHERE stage_attempt_id = ANY(${parsed.data.attempt_ids}::uuid[])
       AND needs_review = true
  `;

  await auditLog(reviewer.actor, 'grader.review.assign', null, {
    attempt_ids: parsed.data.attempt_ids,
    assigned_to: assignee,
  });

  return NextResponse.json({ ok: true });
}
