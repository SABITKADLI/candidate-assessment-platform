import { sql, auditLog } from '@cap/db';
import type { CompositeOutput } from './composite.js';
import type { MemoOutput } from './memo.js';

export type AtsProvider = 'greenhouse' | 'lever' | 'workday';

export interface EnqueueArgs {
  session_id: string;
  ats: AtsProvider;
  composite: CompositeOutput;
  memo: MemoOutput;
}

// Vendor formats are narrow on purpose. Real production would add per-vendor
// fields (job_id, stage_id, etc.); those come from the role config, not here.
function buildPayload(a: EnqueueArgs): Record<string, unknown> {
  const base = {
    session_id: a.session_id,
    composite: a.composite.composite,
    recommendation: a.memo.recommendation,
    memo_key: a.memo.s3_key,
    per_stage: a.composite.per_stage,
  };
  switch (a.ats) {
    case 'greenhouse':
      return {
        kind: 'score_card',
        attributes: {
          overall_rating:
            a.memo.recommendation === 'advance' ? 'strong_yes' :
            a.memo.recommendation === 'hold'    ? 'mixed' :
            a.memo.recommendation === 'decline' ? 'no' : 'definitely_not',
          ratings: a.composite.per_stage,
        },
        ...base,
      };
    case 'lever':
      return {
        kind: 'note',
        note: `CAP composite ${a.composite.composite}/100 — ${a.memo.recommendation}`,
        ...base,
      };
    case 'workday':
      return {
        kind: 'assessment_result',
        result_code:
          a.memo.recommendation === 'advance' ? 'ADV' :
          a.memo.recommendation === 'hold'    ? 'HLD' :
          a.memo.recommendation === 'decline' ? 'DCL' : 'UNK',
        score: a.composite.composite,
        ...base,
      };
  }
}

export async function enqueueAts(a: EnqueueArgs): Promise<string> {
  const payload = buildPayload(a);
  const [row] = await sql<{ id: string }[]>`
    INSERT INTO app.ats_outbox (session_id, ats, payload)
    VALUES (${a.session_id}::uuid, ${a.ats}::app.ats_provider,
            ${sql.json(payload as never)})
    RETURNING id
  `;
  await auditLog('scoring-worker', 'ats.outbox.enqueue',
    `session:${a.session_id}`, { ats: a.ats, outbox_id: row!.id });
  return row!.id;
}
