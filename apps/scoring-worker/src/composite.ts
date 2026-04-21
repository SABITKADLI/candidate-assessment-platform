import { sql } from '@cap/db';
import type { StageKey } from '@cap/shared';

// ---- composite formula ------------------------------------------------------
// composite = clamp_0_100( proctoring_mult * sum(weight_i * stage_score_i) / sum(weight_i) )
//
// `weight_i` comes from the role's stage_weights (jsonb). Stage keys map to
// weight buckets via STAGE_TO_BUCKET so e.g. A_GMA counts under "gma",
// B_CODING + B_DEBUG both count under "coding".
//
// Missing stages are treated as absent, not zero — they drop out of the
// denominator. A session with only GMA scored gets a GMA-only composite.

export const STAGE_TO_BUCKET: Record<StageKey, string> = {
  A_RESUME: 'resume',
  A_ID_LIVENESS: 'id_liveness',
  A_GMA: 'gma',
  A_BIG5: 'big5_mbti',
  A_MBTI: 'big5_mbti',
  A_RORSCHACH: 'rorschach',
  A_INTEGRITY: 'integrity',
  A_SJT: 'sjt',
  B_CODING: 'coding',
  B_DEBUG: 'coding',
  B_WORK_SAMPLE: 'work_sample',
  B_ASYNC_VIDEO: 'verbal',
  B_VERBAL: 'verbal',
};

export interface CompositeInput {
  session_id: string;
}
export interface CompositeOutput {
  composite: number;
  per_stage: Record<string, number>;
  proctoring_mult: number;
  weights_version: number;
  weights_used: Record<string, number>;
  missing_buckets: string[];
}

export async function computeComposite({ session_id }: CompositeInput): Promise<CompositeOutput> {
  // 1. Resolve role weights (fallback to the schema default).
  const [cfg] = await sql<Array<{
    weights: Record<string, number>; weights_version: number;
    proctoring_mult: string | null;
  }>>`
    SELECT
      coalesce(r.stage_weights,
               '{"gma":20,"work_sample":20,"coding":20,"verbal":15,"sjt":10,
                 "big5_mbti":8,"integrity":5,"rorschach":2}'::jsonb) AS weights,
      coalesce(r.weights_version, 1) AS weights_version,
      (SELECT proctoring_mult::text FROM app.scores WHERE session_id = s.id) AS proctoring_mult
    FROM app.sessions s
      LEFT JOIN app.roles r ON r.id = s.role_id
    WHERE s.id = ${session_id}::uuid
  `;
  if (!cfg) throw new Error(`session ${session_id} not found`);

  // 2. Aggregate attempt scores by bucket (take the max across attempts).
  const rows = await sql<Array<{ stage_key: StageKey; score: string | null }>>`
    SELECT DISTINCT ON (stage_key)
           stage_key, score
    FROM app.stage_attempts
    WHERE session_id = ${session_id}::uuid AND score IS NOT NULL
    ORDER BY stage_key, score DESC NULLS LAST, attempt_no DESC
  `;

  const bucket: Record<string, number[]> = {};
  for (const r of rows) {
    const b = STAGE_TO_BUCKET[r.stage_key];
    if (!b) continue;
    if (r.score == null) continue;
    (bucket[b] ??= []).push(Number(r.score));
  }

  const per_stage: Record<string, number> = {};
  for (const [b, xs] of Object.entries(bucket)) {
    per_stage[b] = xs.reduce((s, x) => s + x, 0) / xs.length;
  }

  // 3. Weighted sum over present buckets only.
  const weights = cfg.weights;
  let num = 0, den = 0;
  const missing: string[] = [];
  for (const [b, w] of Object.entries(weights)) {
    if (per_stage[b] == null) { missing.push(b); continue; }
    num += w * per_stage[b]!;
    den += w;
  }
  const base = den > 0 ? num / den : 0;

  const mult = cfg.proctoring_mult == null ? 1.0 : Math.min(1.0, Math.max(0.5, Number(cfg.proctoring_mult)));
  const composite = Math.max(0, Math.min(100, mult * base));

  return {
    composite: round3(composite),
    per_stage: Object.fromEntries(Object.entries(per_stage).map(([k, v]) => [k, round3(v)])),
    proctoring_mult: round3(mult),
    weights_version: cfg.weights_version,
    weights_used: weights,
    missing_buckets: missing,
  };
}

function round3(x: number): number { return Math.round(x * 1000) / 1000; }
