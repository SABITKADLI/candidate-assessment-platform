import { z } from 'zod';

export const Flag = z.enum([
  'low_confidence',
  'verifier_disagreement',
  'attention_check_failed',
  'response_pattern_anomaly',
  'ai_generated_suspected',
  'plagiarism_suspected',
  'identity_mismatch',
  'media_corrupt',
  'transcript_low_confidence',
  'short_response',
  'off_topic',
  'multiple_speakers',
  'tts_suspected',
  'lip_sync_mismatch',
  'hardcoded_test_answers',
]);
export type Flag = z.infer<typeof Flag>;

export const SEVERE_FLAGS: Flag[] = [
  'ai_generated_suspected',
  'plagiarism_suspected',
  'identity_mismatch',
];

export const Evidence = z.object({
  kind: z.enum(['quote', 'line_ref', 'test_name', 'timestamp', 'frame_ref']),
  value: z.string(),
  refers_to: z.string().optional(),
});
export type Evidence = z.infer<typeof Evidence>;

export const GraderResult = z.object({
  score: z.number().min(0).max(100),
  subscores: z.record(z.string(), z.number().min(0).max(100)),
  evidence: z.array(Evidence),
  confidence: z.number().min(0).max(1),
  flags: z.array(Flag),
  rationale: z.string().max(2000),
});
export type GraderResult = z.infer<typeof GraderResult>;

export const ReconcileInput = z.object({
  primary: GraderResult,
  verifier: GraderResult.optional(),
});
export type ReconcileInput = z.infer<typeof ReconcileInput>;

export interface ReconcileOutput {
  score: number;
  divergence: number;
  needs_review: boolean;
  review_reason?: 'divergence' | 'low_confidence' | 'severe_flag';
  merged_flags: Flag[];
  merged_subscores: Record<string, number>;
}

export interface RubricSpec {
  stage: string;
  criteria: Array<{ key: string; points: number; description: string }>;
}

export interface GraderInput {
  stage_key: string;
  role_summary?: string;
  candidate_input: unknown;
}
