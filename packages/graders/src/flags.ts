export { Flag, SEVERE_FLAGS, type Flag as GraderFlag } from './schema';

export const FLAG_SEVERITY = {
  low_confidence: 'low',
  verifier_disagreement: 'medium',
  attention_check_failed: 'medium',
  response_pattern_anomaly: 'medium',
  ai_generated_suspected: 'severe',
  plagiarism_suspected: 'severe',
  identity_mismatch: 'severe',
  media_corrupt: 'medium',
  transcript_low_confidence: 'medium',
  short_response: 'low',
  off_topic: 'medium',
  multiple_speakers: 'medium',
  tts_suspected: 'medium',
  lip_sync_mismatch: 'medium',
  hardcoded_test_answers: 'medium',
} as const;
