import { NextResponse } from 'next/server';
import { getAdminDiagnostics } from '@/lib/diagnostics';
import { requireRecruiterApiSession } from '@/lib/auth0';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  const auth = await requireRecruiterApiSession();
  if (!auth.ok) return auth.response;

  const diagnostics = await getAdminDiagnostics();
  return NextResponse.json(diagnostics, { status: diagnostics.ok ? 200 : 503 });
}
