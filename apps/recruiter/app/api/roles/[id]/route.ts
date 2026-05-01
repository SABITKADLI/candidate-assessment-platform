import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { sql } from '@cap/db';
import { auth0, auth0Configured } from '@/lib/auth0';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const zUpdate = z.object({
  name: z.string().min(1).max(120).optional(),
  description: z.string().max(1000).optional(),
  stages_a: z.array(z.string()).min(1).nullable().optional(),
  stages_b: z.array(z.string()).min(1).nullable().optional(),
  stage_weights: z.record(z.string(), z.number().min(0).max(100)).nullable().optional(),
});

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (auth0Configured) {
    const session = await auth0.getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { id } = await params;

  const [role] = await sql<{
    id: string; name: string; description: string | null;
    stages_a: string[] | null; stages_b: string[] | null;
    stage_weights: Record<string, number> | null; weights_version: number;
    created_at: Date; updated_at: Date;
  }[]>`
    SELECT id, name, description, stages_a, stages_b,
           stage_weights, weights_version, created_at, updated_at
    FROM app.roles WHERE id = ${id}::uuid
  `;
  if (!role) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ role });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (auth0Configured) {
    const session = await auth0.getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = zUpdate.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', issues: parsed.error.issues }, { status: 400 });
  }
  const d = parsed.data;

  const [row] = await sql<{ id: string }[]>`
    UPDATE app.roles SET
      name            = COALESCE(${d.name ?? null}, name),
      description     = CASE WHEN ${d.description !== undefined} THEN ${d.description ?? null} ELSE description END,
      stages_a        = CASE WHEN ${'stages_a' in d} THEN ${d.stages_a ? sql.array(d.stages_a) : null} ELSE stages_a END,
      stages_b        = CASE WHEN ${'stages_b' in d} THEN ${d.stages_b ? sql.array(d.stages_b) : null} ELSE stages_b END,
      stage_weights   = CASE WHEN ${'stage_weights' in d} THEN ${d.stage_weights ? sql.json(d.stage_weights as never) : null} ELSE stage_weights END,
      weights_version = weights_version + 1,
      updated_at      = now()
    WHERE id = ${id}::uuid
    RETURNING id
  `;
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (auth0Configured) {
    const session = await auth0.getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { id } = await params;

  await sql`UPDATE app.sessions SET role_id = NULL WHERE role_id = ${id}::uuid`;
  await sql`DELETE FROM app.roles WHERE id = ${id}::uuid`;
  return NextResponse.json({ ok: true });
}
