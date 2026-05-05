import { SEVERE_FLAGS, type Flag, type GraderResult, type ReconcileOutput } from './schema';

const DIVERGENCE_REVIEW_THRESHOLD = 15;
const DIVERGENCE_WARN_THRESHOLD = 10;
const LOW_CONFIDENCE_THRESHOLD = 0.6;

export function reconcile(primary: GraderResult, verifier?: GraderResult): ReconcileOutput {
  const divergence = verifier ? round3(Math.abs(primary.score - verifier.score)) : 0;
  const score = verifier ? round3((primary.score + verifier.score) / 2) : round3(primary.score);
  const merged_flags = mergeFlags(primary.flags, verifier?.flags ?? []);
  const merged_subscores = mergeSubscores(primary.subscores, verifier?.subscores);

  if (verifier && divergence >= DIVERGENCE_WARN_THRESHOLD && divergence <= DIVERGENCE_REVIEW_THRESHOLD) {
    if (!merged_flags.includes('low_confidence')) merged_flags.push('low_confidence');
  }

  const minConfidence = Math.min(primary.confidence, verifier?.confidence ?? primary.confidence);
  const severe = merged_flags.some((flag) => SEVERE_FLAGS.includes(flag));
  const needs_review =
    severe ||
    divergence > DIVERGENCE_REVIEW_THRESHOLD ||
    minConfidence < LOW_CONFIDENCE_THRESHOLD;

  let review_reason: ReconcileOutput['review_reason'];
  if (needs_review) {
    if (severe) review_reason = 'severe_flag';
    else if (divergence > DIVERGENCE_REVIEW_THRESHOLD) review_reason = 'divergence';
    else review_reason = 'low_confidence';
  }

  return {
    score,
    divergence,
    needs_review,
    review_reason,
    merged_flags,
    merged_subscores,
  };
}

function mergeFlags(a: Flag[], b: Flag[]): Flag[] {
  return Array.from(new Set([...a, ...b]));
}

function mergeSubscores(
  primary: Record<string, number>,
  verifier?: Record<string, number>,
): Record<string, number> {
  if (!verifier) return { ...primary };
  const out: Record<string, number> = {};
  for (const key of new Set([...Object.keys(primary), ...Object.keys(verifier)])) {
    const p = primary[key];
    const v = verifier[key];
    if (p != null && v != null) out[key] = round3((p + v) / 2);
    else out[key] = round3(p ?? v ?? 0);
  }
  return out;
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}
