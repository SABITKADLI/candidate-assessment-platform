import Anthropic from '@anthropic-ai/sdk';
import { sql } from '@cap/db';

const MODEL = process.env.MEMO_MODEL ?? 'claude-sonnet-4-20250514';

let _anthropic: Anthropic | null = null;
function anthropic(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  _anthropic ??= new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return _anthropic;
}

const WORK_SAMPLE_SYSTEM = `You are a technical assessor grading a candidate's written technical design response.

Score the response from 0 to 100 based on:
- Technical accuracy and correctness (30 pts)
- Depth and completeness — does it cover the key requirements? (25 pts)
- Clarity and structure — easy to follow, logically organised (20 pts)
- Trade-off awareness — acknowledges edge cases and constraints (15 pts)
- Practical applicability — would this actually work in production? (10 pts)

Respond with ONLY a JSON object: {"score": <integer 0-100>}
No explanation, no markdown, just the JSON.`;

function wordCountScore(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  if (words < 30) return 20;
  if (words < 100) return 40;
  if (words < 200) return 55;
  if (words < 400) return 68;
  if (words < 600) return 78;
  return 85;
}

async function scoreWorkSampleWithClaude(text: string): Promise<number> {
  const client = anthropic();
  if (!client) return wordCountScore(text);

  try {
    const msg = await client.messages.create({
      model: MODEL,
      max_tokens: 64,
      system: WORK_SAMPLE_SYSTEM,
      messages: [{ role: 'user', content: `Rate this response:\n\n${text.slice(0, 4000)}` }],
    });
    const raw = msg.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('')
      .trim();
    const parsed = JSON.parse(raw) as { score?: unknown };
    const score = Number(parsed.score);
    if (!isNaN(score) && score >= 0 && score <= 100) return Math.round(score);
  } catch { /* fall through to heuristic */ }
  return wordCountScore(text);
}

async function writeScore(attempt_id: string, score: number): Promise<void> {
  await sql`
    UPDATE app.stage_attempts SET score = ${score} WHERE id = ${attempt_id}::uuid
  `;
}

async function artifactExists(session_id: string, stage_key: string): Promise<boolean> {
  const rows = await sql<{ id: string }[]>`
    SELECT id FROM app.artifacts
    WHERE session_id = ${session_id}::uuid
      AND stage_key  = ${stage_key}::app.stage_key
    LIMIT 1
  `;
  return rows.length > 0;
}

interface UnscoredAttempt {
  id: string;
  stage_key: string;
  raw_payload: unknown;
}

export async function scoreUnscored(session_id: string): Promise<void> {
  const attempts = await sql<UnscoredAttempt[]>`
    SELECT id, stage_key::text AS stage_key, raw_payload
    FROM app.stage_attempts
    WHERE session_id  = ${session_id}::uuid
      AND score IS NULL
      AND completed_at IS NOT NULL
  `;
  if (!attempts.length) return;

  await Promise.allSettled(
    attempts.map(async (a) => {
      switch (a.stage_key) {
        case 'B_WORK_SAMPLE': {
          const payload = a.raw_payload as Record<string, unknown> | null;
          const text = payload?.text as string | undefined;
          if (!text || text.trim().length < 10) { await writeScore(a.id, 0); return; }
          const score = await scoreWorkSampleWithClaude(text);
          await writeScore(a.id, score);
          break;
        }
        case 'B_ASYNC_VIDEO':
        case 'B_VERBAL': {
          const submitted = await artifactExists(session_id, a.stage_key);
          if (submitted) await writeScore(a.id, 100);
          break;
        }
        case 'A_RESUME':
        case 'A_ID_LIVENESS': {
          // Presence stages — completion implies 100
          await writeScore(a.id, 100);
          break;
        }
      }
    }),
  );
}
