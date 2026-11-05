import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { sql } from '@cap/db';
import { requireRecruiterApiSession } from '@/lib/auth0';
import { FLAG_SEVERITIES } from '@cap/shared/enums';

const zBody = z.object({
  resolved: z.boolean().optional(),
  severity: z.enum(FLAG_SEVERITIES).optional(),
}).refine((v) => v.resolved !== undefined || v.severity !== undefined, {
  message: 'Provide at least one of resolved or severity',
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireRecruiterApiSession();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: 'invalid_id' }, { status: 400 });
  }

  const body = await req.json().catch(() => null);
  const parsed = zBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'bad_request' }, { status: 400 });
  }

  const { resolved, severity } = parsed.data;

  const result = await sql<{ id: string }[]>`
    UPDATE app.proctoring_flags
    SET
      resolved    = COALESCE(${resolved ?? null}::boolean,    resolved),
      resolved_at = CASE
                      WHEN ${resolved ?? null}::boolean IS TRUE  THEN now()
                      WHEN ${resolved ?? null}::boolean IS FALSE THEN NULL
                      ELSE resolved_at
                    END,
      severity    = COALESCE(${severity ?? null}::app.flag_severity, severity)
    WHERE id = ${id}::uuid
    RETURNING id
  `;

  if (!result[0]) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  return NextResponse.json({ ok: true, id: result[0].id });
}
