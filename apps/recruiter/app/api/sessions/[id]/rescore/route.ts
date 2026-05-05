import { NextResponse } from 'next/server';
import { auth0, auth0Configured } from '@/lib/auth0';
import { enqueueSessionFinalize } from '@/lib/queues';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (auth0Configured) {
    const session = await auth0.getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: 'invalid_id' }, { status: 400 });
  }
  const jobId = await enqueueSessionFinalize({ session_id: id, reason: 'manual_rescore' });
  return NextResponse.json({ ok: true, job_id: jobId, composite: null, recommendation: 'queued' });
}
