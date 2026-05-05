import assert from 'node:assert/strict';
import test from 'node:test';
import { reconcile, type GraderResult } from '../src/index';

function result(overrides: Partial<GraderResult> = {}): GraderResult {
  return {
    score: 80,
    subscores: { accuracy: 80 },
    evidence: [],
    confidence: 0.9,
    flags: [],
    rationale: 'fixture',
    ...overrides,
  };
}

test('identical scores produce no review and zero divergence', () => {
  const out = reconcile(result(), result());
  assert.equal(out.score, 80);
  assert.equal(out.divergence, 0);
  assert.equal(out.needs_review, false);
});

test('12 point divergence adds low_confidence flag without review', () => {
  const out = reconcile(result({ score: 80 }), result({ score: 68 }));
  assert.equal(out.divergence, 12);
  assert.equal(out.needs_review, false);
  assert.ok(out.merged_flags.includes('low_confidence'));
});

test('18 point divergence requires review with divergence reason', () => {
  const out = reconcile(result({ score: 80 }), result({ score: 62 }));
  assert.equal(out.divergence, 18);
  assert.equal(out.needs_review, true);
  assert.equal(out.review_reason, 'divergence');
});

test('severe flag in either pass requires severe_flag review', () => {
  const out = reconcile(result(), result({ flags: ['ai_generated_suspected'] }));
  assert.equal(out.needs_review, true);
  assert.equal(out.review_reason, 'severe_flag');
});

test('confidence below 0.6 requires low_confidence review', () => {
  const out = reconcile(result({ confidence: 0.5 }), result());
  assert.equal(out.needs_review, true);
  assert.equal(out.review_reason, 'low_confidence');
});
