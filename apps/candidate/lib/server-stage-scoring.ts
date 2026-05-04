import type { StageKey } from '@cap/shared';
import { BIG5_ITEMS, scoreBig5, type LikertValue } from './big5-items';
import { INTEGRITY_ITEMS, scoreIntegrity, type LikertVal } from './integrity-items';
import { MBTI_ITEMS, scoreMbti } from './mbti-items';
import { SJT_SCENARIOS, scoreSjt, type SjtOptionKey } from './sjt-items';

type JsonPayload = Record<string, unknown>;

export class StageScoringError extends Error {
  constructor(public readonly reason: string, detail?: string) {
    super(detail ?? reason);
  }
}

const RORSCHACH_CARD_IDS = ['R01', 'R02', 'R03', 'R04', 'R05', 'R06', 'R07', 'R08', 'R09', 'R10'];
const RORSCHACH_MIN_CHARS = 20;
const WORK_SAMPLE_MIN_WORDS = 50;

export function scoreStageOnServer(
  stageKey: StageKey,
  payload: JsonPayload,
): { score?: number; payload: JsonPayload } {
  switch (stageKey) {
    case 'A_BIG5':
      return scoreBig5Stage(payload);
    case 'A_MBTI':
      return scoreMbtiStage(payload);
    case 'A_SJT':
      return scoreSjtStage(payload);
    case 'A_INTEGRITY':
      return scoreIntegrityStage(payload);
    case 'A_RORSCHACH':
      return scoreRorschachStage(payload);
    case 'B_WORK_SAMPLE':
      return validateWorkSample(payload);
    default:
      return { payload };
  }
}

function scoreBig5Stage(payload: JsonPayload): { score: number; payload: JsonPayload } {
  const answers = requireLikertAnswers(
    BIG5_ITEMS.map((item) => item.id),
    readAnswerRecord(payload, 'items'),
    'answers',
  );
  const scores = scoreBig5(answers);
  const attentionCheckFailures = BIG5_ITEMS
    .filter((item) => item.isCheck && answers[item.id] !== item.checkValue)
    .map((item) => ({ id: item.id, expected: item.checkValue, got: answers[item.id] ?? null }));
  const items = BIG5_ITEMS.map((item) => ({
    id: item.id,
    text: item.text,
    factor: item.factor,
    keyed: item.keyed,
    answer: answers[item.id] ?? null,
    isCheck: item.isCheck ?? false,
  }));
  const score = Math.round(Object.values(scores).reduce((sum, value) => sum + value, 0) / 5);

  return {
    score,
    payload: {
      ...payload,
      answers,
      items,
      scores,
      attention_check_failures: attentionCheckFailures,
      scoring_source: 'server',
    },
  };
}

function scoreMbtiStage(payload: JsonPayload): { score: number; payload: JsonPayload } {
  const answers = requireChoiceAnswers(
    MBTI_ITEMS.map((item) => item.id),
    readAnswerRecord(payload),
    ['a', 'b'],
    'answers',
  ) as Record<string, 'a' | 'b'>;
  const { type, scores } = scoreMbti(answers);
  const clarityScore = Math.round(
    Object.values(scores).reduce((sum, { a, b }) => {
      const total = a + b || 1;
      return sum + (Math.abs(a - b) / total) * 100;
    }, 0) / 4,
  );

  return {
    score: clarityScore,
    payload: { ...payload, answers, type, scores, clarity_score: clarityScore, scoring_source: 'server' },
  };
}

function scoreSjtStage(payload: JsonPayload): { score: number; payload: JsonPayload } {
  const answers = requireChoiceAnswers(
    SJT_SCENARIOS.map((scenario) => scenario.id),
    readAnswerRecord(payload),
    ['A', 'B', 'C', 'D'],
    'answers',
  ) as Record<string, SjtOptionKey>;
  const score = scoreSjt(answers);
  const items = SJT_SCENARIOS.map((scenario) => {
    const chosenKey = answers[scenario.id];
    const chosenOption = scenario.options.find((option) => option.key === chosenKey);
    return {
      id: scenario.id,
      situation: scenario.situation,
      chosen_key: chosenKey ?? null,
      chosen_text: chosenOption?.text ?? null,
      item_score: chosenOption?.score ?? null,
      isAttentionCheck: scenario.isAttentionCheck ?? false,
    };
  });
  const attentionCheckFailures = SJT_SCENARIOS
    .filter((scenario) => scenario.isAttentionCheck && scenario.correctKey && answers[scenario.id] !== scenario.correctKey)
    .map((scenario) => ({ id: scenario.id, expected: scenario.correctKey, got: answers[scenario.id] ?? null }));

  return {
    score,
    payload: {
      ...payload,
      answers,
      items,
      attention_check_failures: attentionCheckFailures,
      scoring_source: 'server',
    },
  };
}

function scoreIntegrityStage(payload: JsonPayload): { score: number; payload: JsonPayload } {
  const answers = requireLikertAnswers(
    INTEGRITY_ITEMS.map((item) => item.id),
    readAnswerRecord(payload),
    'answers',
  ) as Record<string, LikertVal>;
  const score = scoreIntegrity(answers);
  const items = INTEGRITY_ITEMS.map((item) => ({
    id: item.id,
    text: item.text,
    keyed: item.keyed,
    answer: answers[item.id] ?? null,
  }));

  return { score, payload: { ...payload, answers, items, scoring_source: 'server' } };
}

function scoreRorschachStage(payload: JsonPayload): { score: number; payload: JsonPayload } {
  const responses = getRecord(payload.responses, 'responses');
  const normalized: Record<string, string> = {};
  const metrics: Array<{ id: string; chars: number; words: number }> = [];

  for (const id of RORSCHACH_CARD_IDS) {
    const text = responses[id];
    if (typeof text !== 'string') {
      throw new StageScoringError('missing_answer', `missing response for ${id}`);
    }
    const trimmed = text.trim();
    if (trimmed.length < RORSCHACH_MIN_CHARS) {
      throw new StageScoringError('answer_too_short', `${id} must be at least ${RORSCHACH_MIN_CHARS} characters`);
    }
    normalized[id] = trimmed;
    metrics.push({ id, chars: trimmed.length, words: countWords(trimmed) });
  }

  return {
    score: 100,
    payload: {
      ...payload,
      responses: normalized,
      response_metrics: metrics,
      scoring_policy: 'completion_only_minimum_response',
      scoring_source: 'server',
    },
  };
}

function validateWorkSample(payload: JsonPayload): { payload: JsonPayload } {
  const text = typeof payload.text === 'string' ? payload.text.trim() : '';
  if (!text) {
    throw new StageScoringError('missing_answer', 'work sample text is required');
  }
  const wordCount = countWords(text);
  if (wordCount < WORK_SAMPLE_MIN_WORDS) {
    throw new StageScoringError('answer_too_short', `work sample must be at least ${WORK_SAMPLE_MIN_WORDS} words`);
  }
  return {
    payload: {
      ...payload,
      text,
      word_count: wordCount,
      scoring_source: 'server_validated_worker_scored',
    },
  };
}

function readAnswerRecord(payload: JsonPayload, fallbackItemsKey?: string): JsonPayload {
  if (payload.answers !== undefined) return getRecord(payload.answers, 'answers');

  if (fallbackItemsKey) {
    const items = payload[fallbackItemsKey];
    if (Array.isArray(items)) {
      const answers: JsonPayload = {};
      for (const item of items) {
        if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
        const row = item as JsonPayload;
        if (typeof row.id === 'string' && row.answer !== undefined) answers[row.id] = row.answer;
      }
      return answers;
    }
  }

  throw new StageScoringError('missing_answers', 'payload.answers is required');
}

function requireLikertAnswers(ids: string[], source: JsonPayload, label: string): Record<string, LikertValue> {
  const answers: Record<string, LikertValue> = {};
  for (const id of ids) {
    const raw = source[id];
    if (raw !== 1 && raw !== 2 && raw !== 3 && raw !== 4 && raw !== 5) {
      throw new StageScoringError('bad_answer', `${label}.${id} must be an integer from 1 to 5`);
    }
    answers[id] = raw;
  }
  return answers;
}

function requireChoiceAnswers(
  ids: string[],
  source: JsonPayload,
  allowed: readonly string[],
  label: string,
): Record<string, string> {
  const answers: Record<string, string> = {};
  for (const id of ids) {
    const raw = source[id];
    if (typeof raw !== 'string' || !allowed.includes(raw)) {
      throw new StageScoringError('bad_answer', `${label}.${id} must be one of ${allowed.join(', ')}`);
    }
    answers[id] = raw;
  }
  return answers;
}

function getRecord(value: unknown, label: string): JsonPayload {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new StageScoringError('bad_payload', `${label} must be an object`);
  }
  return value as JsonPayload;
}

function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}
