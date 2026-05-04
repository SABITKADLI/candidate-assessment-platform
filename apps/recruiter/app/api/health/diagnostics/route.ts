import { NextResponse } from 'next/server';
import { getAdminDiagnostics } from '@/lib/diagnostics';
import { auth0, auth0Configured } from '@/lib/auth0';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  if (auth0Configured) {
    const session = await auth0.getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const diagnostics = await getAdminDiagnostics();
  return NextResponse.json(diagnostics, { status: diagnostics.ok ? 200 : 503 });
}
