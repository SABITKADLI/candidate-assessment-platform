import { NextResponse } from 'next/server';
import { auditLog } from '@cap/db';
import { requireReviewer } from '@/lib/reviewer';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST() {
  let reviewer;
  try {
    reviewer = await requireReviewer();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  await auditLog(reviewer.actor, 'grader.calibration.request', null, {
    source: 'recruiter_api',
  });

  return NextResponse.json({
    ok: true,
    detail: 'Calibration request recorded. Run `pnpm --filter @cap/scoring-worker calibration:run` locally or in the worker host.',
  });
}
