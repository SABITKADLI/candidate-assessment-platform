import { z } from 'zod';
import {
  STAGE_KEYS, STAGE_GROUPS, SESSION_STATUSES,
  ARTIFACT_KINDS, FLAG_SEVERITIES,
} from './enums.js';

export const zStageKey       = z.enum(STAGE_KEYS);
export const zStageGroup     = z.enum(STAGE_GROUPS);
export const zSessionStatus  = z.enum(SESSION_STATUSES);
export const zArtifactKind   = z.enum(ARTIFACT_KINDS);
export const zFlagSeverity   = z.enum(FLAG_SEVERITIES);

// Resume token format: opaque, URL-safe. Validate shape only, not authenticity.
export const zResumeToken = z.string().regex(/^tok_[A-Za-z0-9_-]{16,}$/);

// Consent payload submitted at candidate onboarding.
export const zConsentPayload = z.object({
  consent_version: z.string().min(1),
  email: z.string().email(),
  // Optional device fingerprint (FingerprintJS Pro visitorId).
  fingerprint: z.string().optional(),
});
export type ConsentPayload = z.infer<typeof zConsentPayload>;

// Telemetry event shape (client -> server ingress).
export const zTelemetryEvent = z.object({
  type: z.string().min(1).max(64),
  stage_key: zStageKey.optional(),
  payload: z.record(z.string(), z.unknown()).default({}),
  // Client-side monotonic clock in ms; server stamps wall-clock ts itself.
  client_t: z.number().int().nonnegative().optional(),
});
export type TelemetryEvent = z.infer<typeof zTelemetryEvent>;

// Batched telemetry ingress envelope.
export const zTelemetryBatch = z.object({
  events: z.array(zTelemetryEvent).min(1).max(500),
});
export type TelemetryBatch = z.infer<typeof zTelemetryBatch>;
