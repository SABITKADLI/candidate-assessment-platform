import type { GraderResult } from '@cap/graders';
import { formatRubric, type Rubric } from './rubrics.js';

export function buildPrimaryPrompt(args: {
  rubric: Rubric;
  roleSummary: string;
  candidateInput: unknown;
}): { system: string; user: string } {
  const system = `You are grading ${args.rubric.stageName}. Output ONLY a JSON object matching the schema. Do not include markdown, prose, or code fences. JSON only.`;
  const resumeInstructions = args.rubric.stageName === 'Resume Review'
    ? [
        '- For resume review, compare the extracted resume text directly against the role description.',
        '- Explain the strongest matches, partial matches, missing requirements, and transferable evidence in the rationale.',
        '- Treat extraction_status other than "extracted" as weak evidence and lower confidence.',
      ].join('\n')
    : null;
  const user = `ROLE CONTEXT:
${args.roleSummary}

RUBRIC:
${formatRubric(args.rubric)}

INPUT:
${JSON.stringify(args.candidateInput, null, 2)}

INSTRUCTIONS:
- Be conservative. If evidence is weak, lower score AND confidence.
- Quote specific phrases or refer to specific lines/timestamps as evidence.
- Set flags only when warranted. Severe flags require strong justification.
- Subscore keys MUST match the rubric criteria names exactly.
${resumeInstructions ?? ''}

SCHEMA:
{
  "score": <int 0-100>,
  "subscores": { "<criterion>": <int 0-100>, ... },
  "evidence": [{"kind":"quote|line_ref|test_name|timestamp|frame_ref", "value":"...", "refers_to":"..."}],
  "confidence": <float 0-1>,
  "flags": [],
  "rationale": "<<=500 words>"
}`;
  return { system, user };
}

export function buildVerifierPrompt(args: {
  rubric: Rubric;
  roleSummary: string;
  candidateInput: unknown;
  primary: GraderResult;
}): { system: string; user: string } {
  const system = `You are an independent second reviewer for ${args.rubric.stageName}. Verify the primary grader's claims, but disagree when the evidence contradicts them. Output ONLY JSON matching the schema.`;
  const resumeInstructions = args.rubric.stageName === 'Resume Review'
    ? [
        '- For resume review, verify the role-match explanation against the extracted resume text and role description.',
        '- Note missing or only partially supported requirements in the rationale.',
      ].join('\n')
    : null;
  const user = `ROLE CONTEXT:
${args.roleSummary}

RUBRIC:
${formatRubric(args.rubric)}

INPUT:
${JSON.stringify(args.candidateInput, null, 2)}

PRIMARY GRADER OUTPUT TO VERIFY:
${JSON.stringify({
  score: args.primary.score,
  subscores: args.primary.subscores,
  evidence: args.primary.evidence,
  confidence: args.primary.confidence,
  flags: args.primary.flags,
}, null, 2)}

INSTRUCTIONS:
- Verify the primary grader's claims against the input evidence.
- Keep the same schema and rubric subscore keys.
- You may disagree with the score, subscores, evidence, confidence, or flags.
- Be conservative. Severe flags require strong justification.
${resumeInstructions ?? ''}

SCHEMA:
{
  "score": <int 0-100>,
  "subscores": { "<criterion>": <int 0-100>, ... },
  "evidence": [{"kind":"quote|line_ref|test_name|timestamp|frame_ref", "value":"...", "refers_to":"..."}],
  "confidence": <float 0-1>,
  "flags": [],
  "rationale": "<<=500 words>"
}`;
  return { system, user };
}
