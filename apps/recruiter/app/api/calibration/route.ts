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
  const stage = req.nextUrl.searchParams.get('stage');
  const rows = await sql`
    SELECT cs.stage_key::text AS stage_key,
           cr.grader_version,
           cr.model,
           count(*)::int AS sample_size,
           avg(cr.abs_error)::numeric(6,3)::text AS mae,
           count(*) FILTER (WHERE cr.flagged)::int AS flagged_count,
           max(cr.ran_at) AS last_run_at
    FROM app.calibration_runs cr
    JOIN app.calibration_set cs ON cs.id = cr.fixture_id
    WHERE (${stage}::text IS NULL OR cs.stage_key::text = ${stage})
      AND cr.ran_at >= now() - interval '30 days'
    GROUP BY cs.stage_key, cr.grader_version, cr.model
    ORDER BY cs.stage_key, cr.grader_version
  `;
  return NextResponse.json({ rows });
}
