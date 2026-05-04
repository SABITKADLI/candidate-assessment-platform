import Anthropic from '@anthropic-ai/sdk';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { sql } from '@cap/db';
import type { CompositeOutput } from './composite.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROMPT = readFileSync(join(__dirname, '..', 'prompts', 'memo.md'), 'utf8');

// Lazy clients so this module doesn't blow up on import when keys are missing.
let _anthropic: Anthropic | null = null;
function anthropic(): Anthropic {
  if (_anthropic) return _anthropic;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');
  _anthropic = new Anthropic({ apiKey });
  return _anthropic;
}

let _s3: S3Client | null = null;
function s3(): S3Client {
  if (_s3) return _s3;
  _s3 = new S3Client({ region: process.env.AWS_REGION ?? 'eu-north-1' });
  return _s3;
}

const MODEL = process.env.MEMO_MODEL ?? 'claude-sonnet-4-6-20250930';
const BUCKET = process.env.S3_BUCKET ?? '';

export interface MemoInput {
  session_id: string;
  composite: CompositeOutput;
}
export interface MemoOutput {
  s3_key: string | null;
  markdown: string;
  recommendation: 'advance' | 'hold' | 'decline' | 'unknown';
}

interface Evidence {
  role_name: string | null;
  stage: string;
  status: string;
  attempts: Array<{ stage_key: string; score: number | null; duration_s: number | null }>;
  open_flags: Array<{ severity: string; reason: string; details: unknown }>;
  composite: CompositeOutput;
}

export async function generateMemo({ session_id, composite }: MemoInput): Promise<MemoOutput> {
  const ev = await gatherEvidence(session_id, composite);

  const msg = await anthropic().messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: PROMPT,
    messages: [{ role: 'user', content: JSON.stringify(ev) }],
  });

  const text = msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim();

  const recommendation = parseRecommendation(text);

  let s3_key: string | null = null;
  if (BUCKET) {
    s3_key = `memos/${session_id}/${Date.now()}.md`;
    await s3().send(new PutObjectCommand({
      Bucket: BUCKET,
      Key: s3_key,
      Body: text,
      ContentType: 'text/markdown; charset=utf-8',
      ServerSideEncryption: 'aws:kms',
    }));
  }
  return { s3_key, markdown: text, recommendation };
}

async function gatherEvidence(session_id: string, composite: CompositeOutput): Promise<Evidence> {
  const [meta] = await sql<Array<{
    stage: string; status: string; role_name: string | null;
  }>>`
    SELECT s.stage::text, s.status::text, r.name AS role_name
    FROM app.sessions s LEFT JOIN app.roles r ON r.id = s.role_id
    WHERE s.id = ${session_id}::uuid
  `;
  if (!meta) throw new Error(`session ${session_id} not found`);

  const attempts = await sql<Array<{
    stage_key: string; score: string | null; duration_s: number | null;
  }>>`
    SELECT stage_key::text, score, duration_s
    FROM app.stage_attempts
    WHERE session_id = ${session_id}::uuid
    ORDER BY stage_key, attempt_no
  `;

  const flags = await sql<Array<{ severity: string; reason: string; details: unknown }>>`
    SELECT severity::text, reason, details
    FROM app.proctoring_flags
    WHERE session_id = ${session_id}::uuid
      AND resolved = false
      AND severity IN ('medium','high','critical')
    ORDER BY created_at DESC
    LIMIT 25
  `;

  return {
    role_name: meta.role_name,
    stage: meta.stage,
    status: meta.status,
    attempts: attempts.map((a) => ({
      stage_key: a.stage_key,
      score: a.score == null ? null : Number(a.score),
      duration_s: a.duration_s,
    })),
    open_flags: flags,
    composite,
  };
}

function parseRecommendation(md: string): MemoOutput['recommendation'] {
  // The prompt fixes the three exact phrases; match defensively.
  if (/advance to stage c/i.test(md)) return 'advance';
  if (/hold for human review/i.test(md)) return 'hold';
  if (/\bdecline\b/i.test(md)) return 'decline';
  return 'unknown';
}
