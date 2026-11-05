import { NextResponse } from 'next/server';
import { requireRecruiterApiSession } from '@/lib/auth0';
import { enqueueSessionFinalize } from '@/lib/queues';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireRecruiterApiSession();
  if (!auth.ok) return auth.response;
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: 'invalid_id' }, { status: 400 });
  }
  const jobId = await enqueueSessionFinalize({ session_id: id, reason: 'manual_rescore' });
  return NextResponse.json({ ok: true, job_id: jobId, composite: null, recommendation: 'queued' });
}
