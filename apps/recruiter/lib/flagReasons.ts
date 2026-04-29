import type { FlagSeverity } from '@cap/shared/enums';

export interface FlagReasonInfo {
  label: string;
  description: string;
  severity: FlagSeverity;
  scoreDelta: number;
}

export interface FlagGroup {
  title: string;
  reasons: string[];
}

export const FLAG_REASON_MAP: Record<string, FlagReasonInfo> = {
  // Environment / device
  'env.webdriver': {
    label: 'Automation detected',
    description: 'navigator.webdriver is true — Selenium, Playwright, or similar tool is controlling the browser.',
    severity: 'high', scoreDelta: -8,
  },
  'env.cdp_hint': {
    label: 'Remote control (CDP)',
    description: 'Chrome DevTools Protocol socket detected — browser is being driven remotely.',
    severity: 'high', scoreDelta: -8,
  },
  'env.headless': {
    label: 'Headless browser',
    description: 'UA contains "HeadlessChrome" or 2+ headless fingerprints detected — no real browser is in use.',
    severity: 'critical', scoreDelta: -10,
  },
  'env.devtools_open': {
    label: 'DevTools opened',
    description: 'Browser window dimensions suggest developer tools may have been opened. Low-confidence heuristic — can false-positive on browsers with built-in sidebars.',
    severity: 'low', scoreDelta: -1,
  },
  'env.tz_ip_mismatch': {
    label: 'Timezone / IP mismatch',
    description: "Browser timezone doesn't match the timezone inferred from the candidate's IP — possible VPN or proxy.",
    severity: 'medium', scoreDelta: -4,
  },
  'env.fp_drift': {
    label: 'Browser fingerprint changed',
    description: 'Canvas/WebGL/audio fingerprint changed mid-session — possible browser swap or VM snapshot rollback.',
    severity: 'medium', scoreDelta: -4,
  },

  // Input behaviour
  'input.paste_external': {
    label: 'External paste',
    description: 'Candidate pasted text/plain or text/html — likely copied an answer from outside the browser.',
    severity: 'medium', scoreDelta: -4,
  },
  'input.paste_large': {
    label: 'Large paste (>400 B)',
    description: 'A large block of text (>400 bytes) was pasted — possible bulk answer import.',
    severity: 'low', scoreDelta: -3,
  },
  'input.kd_robotic': {
    label: 'Robotic typing rhythm',
    description: 'Keystroke timing over 30+ keystrokes is unnaturally uniform — consistent with an autotyper or LLM agent.',
    severity: 'medium', scoreDelta: -5,
  },
  'input.mm_straight': {
    label: 'Scripted mouse movement',
    description: 'Mouse movement is too straight and low-entropy over 32+ samples — consistent with programmatic control.',
    severity: 'medium', scoreDelta: -4,
  },

  // Network
  'net.offline': {
    label: 'Network dropped',
    description: 'Network connection went offline momentarily during the session.',
    severity: 'info', scoreDelta: -1,
  },

  // Camera / audio
  'media.face_none': {
    label: 'No face detected',
    description: 'No face visible in webcam frame — candidate may have left their seat or covered the camera.',
    severity: 'medium', scoreDelta: -3,
  },
  'media.face_multi': {
    label: 'Multiple faces',
    description: 'More than one face detected in the webcam frame — another person is present.',
    severity: 'high', scoreDelta: -6,
  },
  'media.phone': {
    label: 'Phone in frame',
    description: 'A mobile phone was detected in the webcam frame — candidate may be consulting an external device.',
    severity: 'high', scoreDelta: -8,
  },
  'media.voice_second': {
    label: 'Second voice detected',
    description: 'A second voice was detected in audio — another person may be coaching the candidate.',
    severity: 'high', scoreDelta: -6,
  },

  // Verification
  'puzzle.failed': {
    label: 'Proof-of-human failed',
    description: 'Candidate failed a tap/gesture challenge injected by the system to verify a human is present.',
    severity: 'high', scoreDelta: -6,
  },

  // Response integrity
  'timing.too_fast': {
    label: 'Stage completed too quickly',
    description: 'Stage was completed in less than 50% of the median time for similar sessions, or below the absolute minimum — answers may not reflect genuine reading.',
    severity: 'medium', scoreDelta: -4,
  },
  'attention.check_failed': {
    label: 'Attention check failed',
    description: 'Candidate failed one or more embedded validity items where the correct response was explicitly stated — indicates random clicking or inattentive responding.',
    severity: 'medium', scoreDelta: -5,
  },
};

export const FLAG_GROUPS: FlagGroup[] = [
  {
    title: 'Environment & Device',
    reasons: ['env.webdriver', 'env.cdp_hint', 'env.headless', 'env.devtools_open', 'env.tz_ip_mismatch', 'env.fp_drift'],
  },
  {
    title: 'Input Behaviour',
    reasons: ['input.paste_external', 'input.paste_large', 'input.kd_robotic', 'input.mm_straight'],
  },
  {
    title: 'Camera & Audio',
    reasons: ['media.face_none', 'media.face_multi', 'media.phone', 'media.voice_second'],
  },
  {
    title: 'Network',
    reasons: ['net.offline'],
  },
  {
    title: 'Verification Challenge',
    reasons: ['puzzle.failed'],
  },
  {
    title: 'Response Integrity',
    reasons: ['timing.too_fast', 'attention.check_failed'],
  },
];

export function resolveFlagReason(reason: string): FlagReasonInfo {
  return FLAG_REASON_MAP[reason] ?? {
    label: reason,
    description: 'Manually raised flag.',
    severity: 'info',
    scoreDelta: 0,
  };
}
