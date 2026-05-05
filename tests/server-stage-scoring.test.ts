import assert from 'node:assert/strict';
import test from 'node:test';
import { BIG5_ITEMS } from '../apps/candidate/lib/big5-items';
import { INTEGRITY_ITEMS } from '../apps/candidate/lib/integrity-items';
import { MBTI_ITEMS } from '../apps/candidate/lib/mbti-items';
import { StageScoringError, scoreStageOnServer } from '../apps/candidate/lib/server-stage-scoring';
import { SJT_SCENARIOS } from '../apps/candidate/lib/sjt-items';

test('server re-scores Big5 from raw answers', () => {
  const answers = Object.fromEntries(
    BIG5_ITEMS.map((item) => [item.id, item.checkValue ?? 4]),
  );

  const result = scoreStageOnServer('A_BIG5', { answers, score: 0 });

  assert.equal(typeof result.payload.mechanical_score, 'number');
  assert.notEqual(result.payload.mechanical_score, 0);
  assert.equal(result.payload.scoring_source, 'server');
  assert.deepEqual(result.payload.attention_check_failures, []);
});

test('server derives legacy Big5 answers from item payloads', () => {
  const items = BIG5_ITEMS.map((item) => ({ id: item.id, answer: item.checkValue ?? 3 }));

  const result = scoreStageOnServer('A_BIG5', { items, score: 100 });

  assert.equal(typeof result.payload.mechanical_score, 'number');
  assert.equal(result.payload.scoring_source, 'server');
});

test('server rejects incomplete questionnaire payloads', () => {
  assert.throws(
    () => scoreStageOnServer('A_SJT', { answers: {} }),
    StageScoringError,
  );
});

test('server re-scores MBTI, SJT, and integrity from raw answers', () => {
  const mbtiAnswers = Object.fromEntries(MBTI_ITEMS.map((item) => [item.id, 'a']));
  const sjtAnswers = Object.fromEntries(SJT_SCENARIOS.map((scenario) => [scenario.id, scenario.correctKey ?? 'A']));
  const integrityAnswers = Object.fromEntries(INTEGRITY_ITEMS.map((item) => [item.id, 4]));

  assert.equal(scoreStageOnServer('A_MBTI', { answers: mbtiAnswers }).payload.scoring_source, 'server');
  assert.equal(typeof scoreStageOnServer('A_SJT', { answers: sjtAnswers }).payload.mechanical_score, 'number');
  assert.equal(typeof scoreStageOnServer('A_INTEGRITY', { answers: integrityAnswers }).payload.mechanical_score, 'number');
});

test('Rorschach is completion-scored with minimum response validation', () => {
  const responses = Object.fromEntries(
    Array.from({ length: 10 }, (_, index) => [`R${String(index + 1).padStart(2, '0')}`, 'This response has enough detail.']),
  );

  const result = scoreStageOnServer('A_RORSCHACH', { responses });

  assert.equal(result.payload.scoring_policy, 'ai_graded_after_minimum_response_validation');
});

test('work sample word count is server-validated', () => {
  const text = Array.from({ length: 55 }, (_, index) => `word${index}`).join(' ');

  const result = scoreStageOnServer('B_WORK_SAMPLE', { text, word_count: 999 });

  assert.equal(result.payload.word_count, 55);
  assert.equal(result.payload.scoring_source, 'server_validated_worker_scored');
});
