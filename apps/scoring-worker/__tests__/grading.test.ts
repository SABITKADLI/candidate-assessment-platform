import assert from 'node:assert/strict';
import test from 'node:test';
import { sandboxPassrate } from '../src/grading/graders';
import { computeProsody } from '../src/grading/prosody';
import { guessResumeName } from '../src/grading/resume';

test('hybrid coding passrate reads sandbox test results', () => {
  assert.equal(sandboxPassrate({ tests: { passed: 3, total: 4 }, timed_out: false, oom_killed: false }), 75);
  assert.equal(sandboxPassrate({ tests: { passed: 4, total: 4 }, timed_out: true, oom_killed: false }), 0);
});

test('prosody computes confidence, pace, fillers, pauses, and speakers', () => {
  const summary = computeProsody([
    { w: 'um', start: 0, end: 0.2, conf: 0.8, speaker: 'spk_0' },
    { w: 'hello', start: 1.2, end: 1.5, conf: 0.9, speaker: 'spk_0' },
    { w: 'there', start: 1.6, end: 1.9, conf: 0.7, speaker: 'spk_1' },
  ]);

  assert.equal(summary.speaker_count, 2);
  assert.equal(summary.filler_ratio, 0.333);
  assert.equal(summary.mean_word_confidence, 0.8);
  assert.deepEqual(summary.pause_distribution_ms, [1000]);
});

test('resume extraction guesses a likely name from early resume lines', () => {
  assert.equal(guessResumeName('Jane Q Public\njane@example.com\nExperience\nBuilt platforms.'), 'Jane Q Public');
  assert.equal(guessResumeName('Resume\n+1 555 123 4567\nSkills\nTypeScript'), null);
});
