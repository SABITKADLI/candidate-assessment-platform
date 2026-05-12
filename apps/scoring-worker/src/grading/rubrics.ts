export interface Criterion {
  key: string;
  points: number;
  description: string;
}

export interface Rubric {
  stageName: string;
  criteria: Criterion[];
}

export const RUBRICS = {
  A_RESUME: {
    stageName: 'Resume Review',
    criteria: [
      { key: 'experience_match', points: 30, description: 'Relevant scope, seniority, and domain experience for the role.' },
      { key: 'skills_match', points: 30, description: 'Evidence of required technical and collaboration skills.' },
      { key: 'trajectory', points: 15, description: 'Career progression, learning rate, and increasing responsibility.' },
      { key: 'red_flags', points: 15, description: 'Higher means fewer concerns about gaps, inconsistency, or unsupported claims.' },
      { key: 'presentation', points: 10, description: 'Clarity, organization, and professional presentation.' },
    ],
  },
  A_ID_LIVENESS: {
    stageName: 'ID & Liveness Verification',
    criteria: [
      { key: 'face_match', points: 35, description: 'ID portrait and live frame appear to show the same person.' },
      { key: 'id_readability', points: 20, description: 'ID image is clear enough to inspect photo and visible name.' },
      { key: 'resume_name_match', points: 25, description: 'Visible ID name appears consistent with the extracted resume name.' },
      { key: 'liveness_plausibility', points: 20, description: 'Live frame appears genuine rather than replayed, printed, or spoofed.' },
    ],
  },
  A_RORSCHACH: {
    stageName: 'Rorschach',
    criteria: [
      { key: 'engagement', points: 20, description: 'Completeness and effort across all cards.' },
      { key: 'coherence', points: 25, description: 'Responses are understandable, grounded, and internally coherent.' },
      { key: 'emotional_tone', points: 25, description: 'Tone is balanced and appropriate without extreme or concerning themes.' },
      { key: 'linguistic_richness', points: 15, description: 'Language is descriptive and nuanced.' },
      { key: 'originality', points: 15, description: 'Responses show individual observation rather than generic repetition.' },
    ],
  },
  A_SJT: {
    stageName: 'SJT Role Fit',
    criteria: [
      { key: 'role_alignment', points: 50, description: 'Choices align with the role expectations and team operating model.' },
      { key: 'judgement_quality', points: 50, description: 'Reasoning shows practical, ethical, and collaborative judgement.' },
    ],
  },
  B_WORK_SAMPLE: {
    stageName: 'Work Sample',
    criteria: [
      { key: 'accuracy', points: 30, description: 'Technically correct and addresses the prompt.' },
      { key: 'depth', points: 25, description: 'Covers important requirements, edge cases, and implications.' },
      { key: 'clarity', points: 20, description: 'Well structured, easy to follow, and precise.' },
      { key: 'tradeoffs', points: 15, description: 'Identifies realistic tradeoffs and constraints.' },
      { key: 'practicality', points: 10, description: 'Proposed approach is workable in production.' },
    ],
  },
  B_CODING: {
    stageName: 'Coding Challenge',
    criteria: [
      { key: 'correctness_beyond_tests', points: 25, description: 'Likely correctness beyond the hidden test suite.' },
      { key: 'code_quality', points: 10, description: 'Readable, maintainable, and well factored.' },
      { key: 'complexity_awareness', points: 10, description: 'Shows awareness of runtime, memory, and edge cases.' },
      { key: 'idiomatic_use', points: 5, description: 'Uses the chosen language idiomatically.' },
    ],
  },
  B_DEBUG: {
    stageName: 'Debug Challenge',
    criteria: [
      { key: 'correctness_beyond_tests', points: 25, description: 'Likely correctness beyond the hidden test suite.' },
      { key: 'code_quality', points: 10, description: 'Readable, maintainable, and minimal.' },
      { key: 'complexity_awareness', points: 10, description: 'Shows awareness of runtime, memory, and edge cases.' },
      { key: 'idiomatic_use', points: 5, description: 'Uses the chosen language idiomatically.' },
    ],
  },
  B_ASYNC_VIDEO: {
    stageName: 'Async Video',
    criteria: [
      { key: 'content_quality', points: 35, description: 'Substantive answer that addresses the prompt.' },
      { key: 'structure_clarity', points: 20, description: 'Clear beginning, middle, end, and logical sequencing.' },
      { key: 'specificity', points: 20, description: 'Uses concrete examples and avoids vague claims.' },
      { key: 'communication_style', points: 15, description: 'Professional, concise, and audience-aware.' },
      { key: 'engagement', points: 10, description: 'Shows presence, energy, and appropriate engagement.' },
    ],
  },
  B_VERBAL: {
    stageName: 'Verbal Response',
    criteria: [
      { key: 'content_quality', points: 35, description: 'Substantive answer that addresses the prompt.' },
      { key: 'structure_clarity', points: 20, description: 'Clear reasoning sequence.' },
      { key: 'specificity', points: 20, description: 'Uses concrete causes, actions, and ordering.' },
      { key: 'delivery', points: 15, description: 'Prosody-informed delivery: pace, pauses, and fluency.' },
      { key: 'engagement', points: 10, description: 'Presence and confidence appropriate to a spoken answer.' },
    ],
  },
} as const satisfies Record<string, Rubric>;

export function formatRubric(rubric: Rubric): string {
  return rubric.criteria
    .map((criterion) => `- ${criterion.key} (${criterion.points} pts): ${criterion.description}`)
    .join('\n');
}

export function weightedScore(subscores: Record<string, number>, rubric: Rubric): number {
  let numerator = 0;
  let denominator = 0;
  for (const criterion of rubric.criteria) {
    const value = subscores[criterion.key];
    if (value == null) continue;
    numerator += value * criterion.points;
    denominator += criterion.points;
  }
  return denominator ? round3(numerator / denominator) : 0;
}

export function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}
