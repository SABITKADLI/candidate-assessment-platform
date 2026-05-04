import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { sql } from '@cap/db';
import { auth0, auth0Configured } from '@/lib/auth0';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const zRole = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(1000).optional(),
  stages_a: z.array(z.string()).min(1).optional(),
  stages_b: z.array(z.string()).min(1).optional(),
  stage_weights: z.record(z.string(), z.number().min(0).max(100)).optional(),
});

export async function GET(req: NextRequest) {
  if (auth0Configured) {
    const session = await auth0.getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const roles = await sql<{
    id: string; name: string; description: string | null;
    stages_a: string[] | null; stages_b: string[] | null;
    stage_weights: Record<string, number> | null; weights_version: number;
    created_at: Date;
  }[]>`
    SELECT id, name, description, stages_a, stages_b, stage_weights, weights_version, created_at
    FROM app.roles
    ORDER BY name ASC
  `;

  return NextResponse.json({ roles });
}

export async function POST(req: NextRequest) {
  if (auth0Configured) {
    const session = await auth0.getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = zRole.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', issues: parsed.error.issues }, { status: 400 });
  }
  const { name, description, stages_a, stages_b, stage_weights } = parsed.data;

  const [row] = await sql<{ id: string }[]>`
    INSERT INTO app.roles (name, description, stages_a, stages_b, stage_weights, updated_at)
    VALUES (
      ${name},
      ${description ?? null},
      ${stages_a ? sql.array(stages_a) : null},
      ${stages_b ? sql.array(stages_b) : null},
      ${stage_weights ? sql.json(stage_weights as never) : null},
      now()
    )
    RETURNING id
  `;
  return NextResponse.json({ id: row!.id }, { status: 201 });
}
