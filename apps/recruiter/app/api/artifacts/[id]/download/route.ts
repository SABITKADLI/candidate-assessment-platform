import { redirect } from 'next/navigation';
import { requireRecruiterApiSession } from '@/lib/auth0';
import { sql } from '@cap/db';
import { presignGet } from '@/lib/s3';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireRecruiterApiSession();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response('Not found', { status: 404 });

  const [artifact] = await sql<Array<{ s3_key: string }>>`
    SELECT s3_key FROM app.artifacts WHERE id = ${id}::uuid LIMIT 1
  `;
  if (!artifact) return new Response('Not found', { status: 404 });

  const url = await presignGet(artifact.s3_key);
  if (!url) return new Response('S3 not configured', { status: 503 });

  redirect(url);
}
