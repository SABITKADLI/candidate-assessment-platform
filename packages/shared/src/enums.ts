// Mirror of Postgres enums in db/migrations/0001. Keep in sync.

export const STAGE_KEYS = [
  'A_RESUME','A_ID_LIVENESS','A_GMA','A_BIG5','A_MBTI','A_RORSCHACH',
  'A_INTEGRITY','A_SJT',
  'B_CODING','B_DEBUG','B_WORK_SAMPLE','B_ASYNC_VIDEO','B_VERBAL',
] as const;
export type StageKey = typeof STAGE_KEYS[number];

export const STAGE_GROUPS = ['A', 'B'] as const;
export type StageGroup = typeof STAGE_GROUPS[number];

export const SESSION_STATUSES = [
  'pending','in_progress','paused','completed','expired','abandoned','disqualified',
] as const;
export type SessionStatus = typeof SESSION_STATUSES[number];

export const ARTIFACT_KINDS = [
  'resume','code','audio','video','screenshot','webcam_frame',
  'liveness','work_sample','transcript',
] as const;
export type ArtifactKind = typeof ARTIFACT_KINDS[number];

export const FLAG_SEVERITIES = ['info','low','medium','high','critical'] as const;
export type FlagSeverity = typeof FLAG_SEVERITIES[number];

// Stage -> group classification (useful for routing, gating)
export const STAGE_GROUP_OF: Record<StageKey, StageGroup> = {
  A_RESUME: 'A', A_ID_LIVENESS: 'A', A_GMA: 'A', A_BIG5: 'A', A_MBTI: 'A',
  A_RORSCHACH: 'A', A_INTEGRITY: 'A', A_SJT: 'A',
  B_CODING: 'B', B_DEBUG: 'B', B_WORK_SAMPLE: 'B',
  B_ASYNC_VIDEO: 'B', B_VERBAL: 'B',
};
