import { NextRequest } from 'next/server';
import { cookies, headers } from 'next/headers';
import { randomUUID } from 'node:crypto';
import { sql } from '@cap/db';
import { zSignalBatch, scoreBatch, type IngestResponse } from '@cap/antibot/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Telemetry ingress. Hot path — do the cheap work inline, defer heavy work
 * to the Redis-backed scoring worker (future phase 6 deliverable).
 *
 * Steps:
 *   1. Parse JSON, validate shape via zod.
 *   2. Resolve session from cookie (set by /s/[token] entry).
 *   3. Persist every event into telemetry.telemetry_events (partitioned).
 *   4. Run a fast scoring pass, insert proctoring_flags, adjust the score
 *      multiplier in app.scores (capped so a single batch can't terminate).
 *   5. Optionally attach a puzzle challenge to the response.
 *
 * We deliberately respond with { ok: true } even for low-severity flags;
 * never tell the client it has been detected.
 */
export async function POST(req: NextRequest) {
  // 1. Parse + validate
  let body: unknown;
  try { body = await req.json(); } catch { return bad('bad_json'); }
  const parsed = zSignalBatch.safeParse(body);
  if (!parsed.success) return bad('bad_shape');
  const batch = parsed.data;

  // 2. Session
  const jar = await cookies();
  const sessionId = jar.get('cap_sess')?.value;
  if (!sessionId) return unauthorized();

  // 3. Score & derive flags (cheap).
  const hdrs = await headers();
  const ipCountry = hdrs.get('cf-ipcountry') ?? undefined;
  // IP->tz best-effort from CF's CF-Timezone header; else skip mismatch check.
  const ipTz = hdrs.get('cf-timezone') ?? undefined;

  const prior = await sql<{ fp: string | null }[]>`
    SELECT (raw_payload->>'fp') AS fp
    FROM app.stage_attempts
    WHERE session_id = ${sessionId}::uuid AND stage_key = ${batch.stage_key}::app.stage_key
    ORDER BY attempt_no DESC LIMIT 1
  `;
  const ctx = { ip_country: ipCountry, ip_tz: ipTz, prev_fingerprint: prior[0]?.fp ?? undefined };
  const score = scoreBatch(batch, ctx);

  // 4. Persist — transactional; telemetry_events is partitioned, cheap inserts.
  await sql.begin(async (tx) => {
    if (batch.events.length) {
      // Bulk insert via postgres.js helper.
      await tx`
        INSERT INTO telemetry.telemetry_events (session_id, stage_key, type, payload, ts)
        SELECT ${sessionId}::uuid, ${batch.stage_key}::app.stage_key,
               e->>'k', coalesce(e->'p','{}'::jsonb), now()
        FROM jsonb_array_elements(${tx.json(batch.events as never)}::jsonb) AS e
      `;
    }
    if (score.flags.length) {
      await tx`
        INSERT INTO app.proctoring_flags (session_id, stage_key, severity, reason, details)
        SELECT ${sessionId}::uuid, ${batch.stage_key}::app.stage_key,
               (f->>'severity')::app.flag_severity,
               f->>'reason',
               coalesce(f->'details','{}'::jsonb)
        FROM jsonb_array_elements(${tx.json(score.flags as never)}::jsonb) AS f
      `;
    }
    if (score.delta !== 0) {
      // Maintain an in-flight score multiplier in-app.scores.proctoring_mult.
      // Scale: 100 -> 1.0, 50 -> 0.5. Single batch clamped by scoreBatch.
      await tx`
        INSERT INTO app.scores (session_id, composite, per_stage, proctoring_mult, weights_version)
        VALUES (${sessionId}::uuid, 0, '{}'::jsonb,
                greatest(0.5, least(1.0, 1.0 + (${score.delta}::numeric / 100))), 1)
        ON CONFLICT (session_id) DO UPDATE
          SET proctoring_mult = greatest(0.5,
                                least(1.0, app.scores.proctoring_mult + (${score.delta}::numeric / 100)))
      `;
    }
    // Remember latest env fingerprint on the current stage attempt for drift checks.
    if (batch.env) {
      const fp = [batch.env.fp.canvas, batch.env.fp.webgl, batch.env.fp.audio].join('|');
      await tx`
        UPDATE app.stage_attempts
           SET raw_payload = raw_payload || ${tx.json({ fp } as never)}
         WHERE session_id = ${sessionId}::uuid
           AND stage_key = ${batch.stage_key}::app.stage_key
      `;
    }
  });

  // 5. Puzzle decision. Deterministic trigger on seq === 2 (~10s into the
  // stage; lets the user orient before interrupting). Additional trigger when
  // this batch flagged two or more real signals. Never more than one puzzle
  // in flight per session — the client gates on that, we just emit.
  const res: IngestResponse = { ok: true };
  const shouldChallenge =
    batch.seq === 2 ||
    (score.flags.filter((f) => f.severity === 'medium' || f.severity === 'high').length >= 2);
  if (shouldChallenge) {
    res.puzzle = makePuzzle();
  }
  return Response.json(res);
}

// ── Puzzle factory — random kind each trigger ────────────────────────────────
const WORD_POOL = ['SUBMIT','CONFIRM','ACCEPT','CONTINUE','NEXT','CANCEL','DECLINE','SKIP','CLEAR','START'];

function makePuzzle(): { kind: 'tap_seq' | 'word_match' | 'math_simple'; seed: string } {
  const roll = Math.random();
  if (roll < 0.34) {
    // tap_seq: tap 5 numbered dots in order
    return { kind: 'tap_seq', seed: randomUUID() };
  }
  if (roll < 0.67) {
    // word_match: click the button matching the target word
    const shuffled = [...WORD_POOL].sort(() => Math.random() - 0.5);
    const options = shuffled.slice(0, 4);
    const target = options[Math.floor(Math.random() * 4)]!;
    return { kind: 'word_match', seed: JSON.stringify({ target, options }) };
  }
  // math_simple: solve A + B
  const a = 2 + Math.floor(Math.random() * 8);
  const b = 2 + Math.floor(Math.random() * 8);
  const correct = a + b;
  const distractors = new Set<number>();
  while (distractors.size < 3) {
    const d = correct + (Math.floor(Math.random() * 5) - 2);
    if (d !== correct && d > 0) distractors.add(d);
  }
  const options = [...distractors, correct].sort(() => Math.random() - 0.5);
  return { kind: 'math_simple', seed: JSON.stringify({ a, b, options, correct }) };
}

function bad(reason: string) {
  return new Response(JSON.stringify({ error: reason }), {
    status: 400, headers: { 'Content-Type': 'application/json' },
  });
}
function unauthorized() {
  return new Response(JSON.stringify({ error: 'no_session' }), {
    status: 401, headers: { 'Content-Type': 'application/json' },
  });
}
