import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@cap/db';
import { auth0, auth0Configured } from '@/lib/auth0';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  if (auth0Configured) {
    const session = await auth0.getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const search = req.nextUrl.searchParams;
  const flags = split(search.get('flags'));
  const role = search.get('role');
  const stage = search.get('stage');
  const reason = search.get('reason');
  const assignee = search.get('assignee');

  const rows = await sql`
    SELECT rec.stage_attempt_id,
           rec.reconciled_score::text AS reconciled_score,
           rec.divergence::text AS divergence,
           rec.review_reason,
           rec.updated_at,
           rec.assigned_to,
           au.email AS assignee_email,
           a.stage_key::text AS stage_key,
           a.scoring_status,
           s.id AS session_id,
           c.email AS candidate_email,
           r.name AS role_name,
           coalesce((
             SELECT array_agg(DISTINCT flag)
             FROM app.score_runs sr
             CROSS JOIN unnest(sr.flags) AS flag
             WHERE sr.stage_attempt_id = a.id
           ), '{}'::text[]) AS flags
    FROM app.score_reconciliations rec
    JOIN app.stage_attempts a ON a.id = rec.stage_attempt_id
    JOIN app.sessions s ON s.id = a.session_id
    JOIN app.candidates c ON c.id = s.candidate_id
    LEFT JOIN app.roles r ON r.id = s.role_id
    LEFT JOIN app.users au ON au.id = rec.assigned_to
    WHERE rec.needs_review = true
      AND (${reason}::text IS NULL OR rec.review_reason = ${reason})
      AND (${stage}::text IS NULL OR a.stage_key::text = ${stage})
      AND (${role}::text IS NULL OR r.name ILIKE '%' || ${role} || '%')
      AND (${assignee}::uuid IS NULL OR rec.assigned_to = ${assignee}::uuid)
      AND (
        cardinality(${flags}::text[]) = 0
        OR EXISTS (
          SELECT 1 FROM app.score_runs sr
          WHERE sr.stage_attempt_id = a.id
            AND sr.flags && ${flags}::text[]
        )
      )
    ORDER BY
      CASE rec.review_reason
        WHEN 'severe_flag' THEN 0
        WHEN 'divergence' THEN 1
        ELSE 2
      END,
      rec.updated_at DESC
    LIMIT 200
  `;

  return NextResponse.json({ rows });
}

function split(value: string | null): string[] {
  return value?.split(',').map((item) => item.trim()).filter(Boolean) ?? [];
}
