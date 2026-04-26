import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { z } from 'zod';
import { sql } from '@cap/db';
import { auth0, auth0Configured } from '@/lib/auth0';

const zBody = z.object({
  email: z.string().email(),
  stage: z.enum(['A', 'B', 'AB']),
  expiry_hours: z.number().int().min(1).max(168).default(48),
});

export async function POST(req: NextRequest) {
  if (auth0Configured) {
    const session = await auth0.getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = zBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', issues: parsed.error.issues }, { status: 400 });
  }

  const { email, stage, expiry_hours } = parsed.data;
  const expiresAt = new Date(Date.now() + expiry_hours * 3_600_000);
  const base = process.env.NEXT_PUBLIC_CANDIDATE_BASE_URL ?? 'http://localhost:3000';

  if (stage === 'AB') {
    // Create Stage A and Stage B sessions in one transaction.
    const tokenA = 'tok_' + randomBytes(20).toString('hex');
    const tokenB = 'tok_' + randomBytes(20).toString('hex');

    const rows = await sql<{ session_id: string; resume_token: string; stage: string }[]>`
      WITH c AS (
        INSERT INTO app.candidates (email, consent_version, consent_ts)
        VALUES (${email}, 'recruiter-v1', now())
        ON CONFLICT (email_norm) WHERE email IS NOT NULL
        DO UPDATE SET updated_at = now()
        RETURNING id
      ),
      sa AS (
        INSERT INTO app.sessions (candidate_id, stage, status, resume_token, expires_at)
        SELECT id, 'A'::app.stage_group, 'pending', ${tokenA}, ${expiresAt}
        FROM c
        RETURNING id AS session_id, resume_token, 'A' AS stage
      ),
      sb AS (
        INSERT INTO app.sessions (candidate_id, stage, status, resume_token, expires_at)
        SELECT id, 'B'::app.stage_group, 'pending', ${tokenB}, ${expiresAt}
        FROM c
        RETURNING id AS session_id, resume_token, 'B' AS stage
      )
      SELECT * FROM sa UNION ALL SELECT * FROM sb
    `;

    const rowA = rows.find((r) => r.stage === 'A');
    if (!rowA) return NextResponse.json({ error: 'Failed to create sessions' }, { status: 500 });

    return NextResponse.json({
      invite_url: `${base}/s/${rowA.resume_token}`,
      session_id: rowA.session_id,
      pipeline: true,
    });
  }

  // Single-stage session (original flow).
  const resumeToken = 'tok_' + randomBytes(20).toString('hex');

  const rows = await sql<{ session_id: string; resume_token: string }[]>`
    WITH c AS (
      INSERT INTO app.candidates (email, consent_version, consent_ts)
      VALUES (${email}, 'recruiter-v1', now())
      ON CONFLICT (email_norm) WHERE email IS NOT NULL
      DO UPDATE SET updated_at = now()
      RETURNING id
    )
    INSERT INTO app.sessions (candidate_id, stage, status, resume_token, expires_at)
    SELECT id, ${stage}::app.stage_group, 'pending', ${resumeToken}, ${expiresAt}
    FROM c
    RETURNING id AS session_id, resume_token
  `;

  const row = rows[0];
  if (!row) return NextResponse.json({ error: 'Failed to create session' }, { status: 500 });

  return NextResponse.json({
    invite_url: `${base}/s/${row.resume_token}`,
    session_id: row.session_id,
    pipeline: false,
  });
}
