import Anthropic from '@anthropic-ai/sdk';
import { createHash } from 'node:crypto';
import type { Flag, GraderResult } from '@cap/graders';
import { GraderResult as zGraderResult } from '@cap/graders';

export interface ClaudeGradeArgs {
  system: string;
  user: string;
  fallback: GraderResult;
}

export interface ClaudeGradeResult {
  result: GraderResult;
  raw_response: string;
  input_token_count?: number;
  output_token_count?: number;
  latency_ms: number;
  prompt_hash: string;
  model: string;
}

const MODEL = process.env.GRADER_MODEL ?? 'claude-sonnet-4-6';

let _client: Anthropic | null = null;

function anthropic(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  _client ??= new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return _client;
}

export function promptHash(...parts: string[]): string {
  return createHash('sha256').update(parts.join('\n---\n')).digest('hex');
}

export async function gradeWithClaude(args: ClaudeGradeArgs): Promise<ClaudeGradeResult> {
  const hash = promptHash(args.system, args.user);
  const started = Date.now();
  const client = anthropic();

  if (!client) {
    const fallback = {
      ...args.fallback,
      confidence: Math.min(args.fallback.confidence, 0.45),
      flags: args.fallback.flags.includes('low_confidence')
        ? args.fallback.flags
        : [...args.fallback.flags, 'low_confidence' as Flag],
    };
    return {
      result: fallback,
      raw_response: JSON.stringify({ fallback: 'ANTHROPIC_API_KEY missing', result: fallback }),
      latency_ms: Date.now() - started,
      prompt_hash: hash,
      model: MODEL,
    };
  }

  const msg = await client.messages.create({
    model: MODEL,
    max_tokens: 1400,
    system: args.system,
    messages: [{ role: 'user', content: args.user }],
  });

  const raw = msg.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('\n')
    .trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(stripCodeFence(raw));
  } catch {
    parsed = null;
  }

  const safe = zGraderResult.safeParse(parsed);
  const result = safe.success
    ? safe.data
    : {
        ...args.fallback,
        confidence: Math.min(args.fallback.confidence, 0.4),
        flags: args.fallback.flags.includes('low_confidence')
          ? args.fallback.flags
          : [...args.fallback.flags, 'low_confidence' as Flag],
        rationale: `Model returned invalid JSON. ${args.fallback.rationale}`.slice(0, 2000),
      };

  return {
    result,
    raw_response: raw,
    input_token_count: msg.usage?.input_tokens,
    output_token_count: msg.usage?.output_tokens,
    latency_ms: Date.now() - started,
    prompt_hash: hash,
    model: MODEL,
  };
}

function stripCodeFence(raw: string): string {
  return raw.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
}
