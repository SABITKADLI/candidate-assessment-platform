import { sql } from '@cap/db';
import { completeStage } from './stage-complete';

// --- Config ---------------------------------------------------------------
export const GMA_N_ITEMS = 20;                    // sampled from the 50-item production bank
export const GMA_DURATION_MS = 20 * 60 * 1000;    // 20 minutes

// --- Progress shape (persisted on stage_attempts.raw_payload.gma) ---------
export interface GmaProgress {
  started_at: string;                // ISO
  deadline: string;                  // ISO (started_at + duration)
  items: Array<{
    item_id: string;
    shuffled: number[];              // permutation of choices (stored so we
                                     // can render consistently across reloads
                                     // and grade against the real index)
  }>;
  answers: Record<string, {          // key = item_id
    shuffled_choice: number;         // index into items[].shuffled
    t_client_ms: number;             // client-side elapsed; for anti-bot
    t_server: string;                // server wall-clock ISO
  }>;
  finished: boolean;
}

// --- Types returned to the client ----------------------------------------
export interface GmaItemView {
  item_id: string;
  category: 'verbal' | 'numerical' | 'abstract';
  prompt: string;
  choices: string[];                 // already shuffled
  index: number;                     // 0-based position in the run
  total: number;
  remaining_ms: number;
}

export type GmaNextResponse =
  | { kind: 'question'; item: GmaItemView }
  | { kind: 'done'; score: number; correct: number; total: number };

// --- Init -----------------------------------------------------------------
interface RawItem { id: string; category: string; prompt: string; choices: string[]; correct_index: number }

async function selectItems(n: number): Promise<RawItem[]> {
  return sql<RawItem[]>`
    SELECT id, category, prompt, choices, correct_index
    FROM app.gma_items
    WHERE active = true
    ORDER BY random()
    LIMIT ${n}
  `;
}

function shufflePermutation(len: number): number[] {
  const a = Array.from({ length: len }, (_, i) => i);
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/** Initialize GMA progress if the attempt row doesn't have it yet. */
async function ensureProgress(sessionId: string): Promise<GmaProgress> {
  const [row] = await sql<Array<{ gma: GmaProgress | null }>>`
    SELECT raw_payload->'gma' AS gma
    FROM app.stage_attempts
    WHERE session_id = ${sessionId}::uuid AND stage_key = 'A_GMA' AND attempt_no = 1
    LIMIT 1
  `;
  if (row?.gma && row.gma.items?.length) return row.gma;

  const picked = await selectItems(GMA_N_ITEMS);
  const now = new Date();
  const deadline = new Date(now.getTime() + GMA_DURATION_MS);
  const progress: GmaProgress = {
    started_at: now.toISOString(),
    deadline: deadline.toISOString(),
    items: picked.map((it) => ({
      item_id: it.id,
      shuffled: shufflePermutation(it.choices.length),
    })),
    answers: {},
    finished: false,
  };

  await sql`
    INSERT INTO app.stage_attempts (session_id, stage_key, attempt_no, raw_payload, started_at)
    VALUES (${sessionId}::uuid, 'A_GMA'::app.stage_key, 1,
            ${sql.json({ gma: progress } as never)}, now())
    ON CONFLICT (session_id, stage_key, attempt_no) DO UPDATE
      SET raw_payload = app.stage_attempts.raw_payload || ${sql.json({ gma: progress } as never)},
          started_at  = COALESCE(app.stage_attempts.started_at, now())
  `;
  return progress;
}

async function saveProgress(sessionId: string, progress: GmaProgress): Promise<void> {
  await sql`
    UPDATE app.stage_attempts
       SET raw_payload = raw_payload || ${sql.json({ gma: progress } as never)}
     WHERE session_id = ${sessionId}::uuid
       AND stage_key = 'A_GMA' AND attempt_no = 1
  `;
}

/** Fetch items needed to render the current run. */
async function loadItems(ids: string[]): Promise<Map<string, RawItem>> {
  if (!ids.length) return new Map();
  const rows = await sql<RawItem[]>`
    SELECT id, category, prompt, choices, correct_index
    FROM app.gma_items
    WHERE id = ANY(${ids}::uuid[])
  `;
  return new Map(rows.map((r) => [r.id, r]));
}

// --- Public API ----------------------------------------------------------
export interface NextInput {
  sessionId: string;
  answer?: { item_id: string; shuffled_choice: number; t_client_ms: number };
}

export async function nextStep({ sessionId, answer }: NextInput): Promise<GmaNextResponse> {
  const progress = await ensureProgress(sessionId);
  const now = new Date();
  const deadline = new Date(progress.deadline);

  // Record the answer if provided and not a duplicate.
  if (answer && !progress.answers[answer.item_id]) {
    const entry = progress.items.find((i) => i.item_id === answer.item_id);
    if (entry && answer.shuffled_choice >= 0 && answer.shuffled_choice < entry.shuffled.length) {
      progress.answers[answer.item_id] = {
        shuffled_choice: answer.shuffled_choice,
        t_client_ms: Math.max(0, answer.t_client_ms | 0),
        t_server: now.toISOString(),
      };
    }
  }

  // Terminal: deadline passed, all answered, or explicit finish.
  const answered = Object.keys(progress.answers).length;
  const expired = now >= deadline;
  const allDone = answered >= progress.items.length;

  if (!progress.finished && (expired || allDone)) {
    progress.finished = true;
    const { score, correct, total } = await grade(progress);
    await saveProgress(sessionId, progress);
    await completeStage({
      session_id: sessionId,
      stage_key: 'A_GMA',
      payload: { gma_summary: { correct, total, expired, finished_at: now.toISOString() } },
      score,
      duration_s: Math.max(1, Math.round((now.getTime() - new Date(progress.started_at).getTime()) / 1000)),
    });
    return { kind: 'done', score, correct, total };
  }

  // Next unanswered item, or resume position.
  const currentIdx = progress.items.findIndex((i) => !progress.answers[i.item_id]);
  if (currentIdx < 0) {
    // Shouldn't happen (would be caught above), but be safe.
    return nextStep({ sessionId });
  }
  const cur = progress.items[currentIdx]!;
  const items = await loadItems([cur.item_id]);
  const raw = items.get(cur.item_id);
  if (!raw) throw new Error(`gma item ${cur.item_id} missing`);

  // Persist incremental answer write so a crash doesn't lose progress.
  if (answer) await saveProgress(sessionId, progress);

  return {
    kind: 'question',
    item: {
      item_id: raw.id,
      category: raw.category as GmaItemView['category'],
      prompt: raw.prompt,
      choices: cur.shuffled.map((i) => raw.choices[i]!),
      index: currentIdx,
      total: progress.items.length,
      remaining_ms: Math.max(0, deadline.getTime() - now.getTime()),
    },
  };
}

async function grade(progress: GmaProgress): Promise<{ score: number; correct: number; total: number }> {
  const ids = progress.items.map((i) => i.item_id);
  const items = await loadItems(ids);
  let correct = 0;
  for (const it of progress.items) {
    const a = progress.answers[it.item_id];
    if (!a) continue;
    const raw = items.get(it.item_id);
    if (!raw) continue;
    const realIdx = it.shuffled[a.shuffled_choice];
    if (realIdx === raw.correct_index) correct++;
  }
  const total = progress.items.length;
  const score = total ? Math.round((correct / total) * 100 * 1000) / 1000 : 0;
  return { score, correct, total };
}
