export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST() {
  return Response.json({
    error: 'direct_upload_required',
    detail: 'Use /api/uploads/presign and /api/uploads/complete.',
  }, { status: 410 });
}
