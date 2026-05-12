import { reconcile as reconcileResults, type Flag, type GraderResult, type ReconcileOutput } from '@cap/graders';
import type { GradeOutcome, RunDraft, StageAttemptRow, StageGrader, GraderContext } from './types.js';
import { gradeWithClaude } from './anthropic.js';
import { buildPrimaryPrompt, buildVerifierPrompt } from './prompts.js';
import { RUBRICS, round3, weightedScore, type Rubric } from './rubrics.js';
import { ensureTranscript } from './transcribe.js';
import { sampleVideoFrames } from './frames.js';
import {
  buildIdentityInput,
  buildIdentityVisionPrompt,
  identityFallback,
} from './identity.js';
import { ensureResumeExtractionForAttempt } from './resume.js';

const DETERMINISTIC_MODEL = 'deterministic';

const INTEGRITY_PATTERN_RUBRIC: Rubric = {
  stageName: 'Integrity Response Pattern Review',
  criteria: [
    { key: 'response_consistency', points: 40, description: 'Responses are internally consistent rather than random or contradictory.' },
    { key: 'attention_quality', points: 30, description: 'Attention checks and response shape suggest the candidate engaged with items.' },
    { key: 'pattern_authenticity', points: 30, description: 'No strong straightlining, acquiescence, or anomalous pattern is evident.' },
  ],
};

export function getStageGrader(stageKey: string): StageGrader {
  switch (stageKey) {
    case 'A_GMA':
      return deterministic('a_gma@v1', scoreGma);
    case 'A_ID_LIVENESS':
      return idLivenessVisionGrader();
    case 'A_BIG5':
      return deterministic('a_big5@v1', scoreBig5);
    case 'A_MBTI':
      return deterministic('a_mbti@v1', scoreMbti);
    case 'A_INTEGRITY':
      return integrityPatternGrader();
    case 'A_RESUME':
      return aiGrader('a_resume@v1', RUBRICS.A_RESUME, resumeInput);
    case 'A_RORSCHACH':
      return aiGrader('a_rorschach@v1', RUBRICS.A_RORSCHACH, (attempt) => ({
        responses: attempt.raw_payload.responses ?? {},
        response_metrics: attempt.raw_payload.response_metrics ?? [],
      }));
    case 'A_SJT':
      return sjtHybridGrader();
    case 'B_WORK_SAMPLE':
      return aiGrader('b_work_sample@v1', RUBRICS.B_WORK_SAMPLE, (attempt) => ({
        text: attempt.raw_payload.text ?? '',
        word_count: attempt.raw_payload.word_count ?? null,
      }));
    case 'B_CODING':
      return codeHybridGrader('b_coding@v1', RUBRICS.B_CODING);
    case 'B_DEBUG':
      return codeHybridGrader('b_debug@v1', RUBRICS.B_DEBUG);
    case 'B_ASYNC_VIDEO':
      return mediaGrader('b_async_video@v1', RUBRICS.B_ASYNC_VIDEO, true);
    case 'B_VERBAL':
      return mediaGrader('b_verbal@v1', RUBRICS.B_VERBAL, false);
    default:
      return deterministic('unknown_stage@v1', async () => ({
        score: 0,
        subscores: {},
        evidence: [],
        confidence: 0.1,
        flags: ['low_confidence'],
        rationale: `No grader registered for ${stageKey}.`,
      }));
  }
}

function deterministic(
  version: string,
  scorer: (attempt: StageAttemptRow) => Promise<GraderResult> | GraderResult,
): StageGrader {
  return {
    version,
    async grade(attempt) {
      const result = await scorer(attempt);
      return {
        primary: deterministicRun(version, result),
        reconciliation: reconcileResults(result),
      };
    },
  };
}

function aiGrader(
  version: string,
  rubric: Rubric,
  inputFromAttempt: (attempt: StageAttemptRow) => unknown | Promise<unknown>,
): StageGrader {
  return {
    version,
    async grade(attempt) {
      const candidateInput = await inputFromAttempt(attempt);
      return runTwoPassAi({
        version,
        rubric,
        attempt,
        candidateInput,
        fallback: fallbackFromRubric(rubric, estimateTextQuality(candidateInput)),
      });
    },
  };
}

function idLivenessVisionGrader(): StageGrader {
  const version = 'a_id_liveness_vision@v1';
  const rubric = RUBRICS.A_ID_LIVENESS;
  return {
    version,
    async grade(attempt) {
      const input = await buildIdentityInput(attempt);
      const fallback = identityFallback(input);

      const primaryPrompt = buildIdentityVisionPrompt(input);
      const primaryCall = await gradeWithClaude({
        ...primaryPrompt,
        fallback,
      });
      const primary: RunDraft = {
        pass_no: 1,
        grader_version: version,
        model: primaryCall.model,
        result: normalizeScoreFromSubscores(primaryCall.result, rubric),
        prompt_hash: primaryCall.prompt_hash,
        raw_response: primaryCall.raw_response,
        input_token_count: primaryCall.input_token_count,
        output_token_count: primaryCall.output_token_count,
        latency_ms: primaryCall.latency_ms,
        rationale: primaryCall.result.rationale,
      };

      if (process.env.GRADER_VERIFIER_ENABLED === 'false') {
        return { primary, reconciliation: reconcileResults(primary.result) };
      }

      const verifierPrompt = buildIdentityVisionPrompt(input, primary.result);
      const verifierCall = await gradeWithClaude({
        ...verifierPrompt,
        fallback: primary.result,
      });
      const verifier: RunDraft = {
        pass_no: 2,
        grader_version: version,
        model: verifierCall.model,
        result: normalizeScoreFromSubscores(verifierCall.result, rubric),
        prompt_hash: verifierCall.prompt_hash,
        raw_response: verifierCall.raw_response,
        input_token_count: verifierCall.input_token_count,
        output_token_count: verifierCall.output_token_count,
        latency_ms: verifierCall.latency_ms,
        rationale: verifierCall.result.rationale,
      };

      return {
        primary,
        verifier,
        reconciliation: reconcileResults(primary.result, verifier.result),
      };
    },
  };
}

function integrityPatternGrader(): StageGrader {
  const version = 'a_integrity_pattern@v1';
  return {
    version,
    async grade(attempt) {
      const mechanical = readNumber(attempt.raw_payload.mechanical_score, 50);
      const fallback = {
        ...fallbackFromRubric(INTEGRITY_PATTERN_RUBRIC, mechanical),
        score: mechanical,
        confidence: 0.7,
      };
      const outcome = await runTwoPassAi({
        version,
        rubric: INTEGRITY_PATTERN_RUBRIC,
        attempt,
        candidateInput: {
          answers: attempt.raw_payload.answers ?? {},
          items: attempt.raw_payload.items ?? [],
          mechanical_score: mechanical,
          attention_check_failures: attempt.raw_payload.attention_check_failures ?? [],
        },
        fallback,
      });
      const primary = outcome.primary!;
      const verifier = outcome.verifier;
      const aiRec = reconcileResults(primary.result, verifier?.result);
      outcome.reconciliation = {
        ...aiRec,
        score: round3(mechanical),
        merged_subscores: aiRec.merged_subscores,
      };
      return outcome;
    },
  };
}

function sjtHybridGrader(): StageGrader {
  const version = 'a_sjt_role_fit@v1';
  return {
    version,
    async grade(attempt) {
      const mechanical = readNumber(attempt.raw_payload.mechanical_score, 50);
      const outcome = await runTwoPassAi({
        version,
        rubric: RUBRICS.A_SJT,
        attempt,
        candidateInput: {
          items: attempt.raw_payload.items ?? [],
          mechanical_score: mechanical,
          attention_check_failures: attempt.raw_payload.attention_check_failures ?? [],
        },
        fallback: fallbackFromRubric(RUBRICS.A_SJT, mechanical),
      });
      const aiRec = reconcileResults(outcome.primary!.result, outcome.verifier?.result);
      outcome.reconciliation = {
        ...aiRec,
        score: round3(0.7 * mechanical + 0.3 * aiRec.score),
      };
      return outcome;
    },
  };
}

function codeHybridGrader(version: string, rubric: Rubric): StageGrader {
  return {
    version,
    async grade(attempt) {
      const sandbox = readSandbox(attempt);
      if (!sandbox) {
        return {
          pending: true,
          pending_delay_ms: 20_000,
          pending_reason: 'waiting_for_sandbox',
        };
      }
      const passrate = sandboxPassrate(sandbox);
      const outcome = await runTwoPassAi({
        version,
        rubric,
        attempt,
        candidateInput: {
          language: attempt.raw_payload.language ?? null,
          problem_id: attempt.raw_payload.problem_id ?? null,
          code: attempt.raw_payload.code ?? '',
          sandbox,
          test_pass_rate: passrate,
        },
        fallback: fallbackFromRubric(rubric, passrate),
      });
      const aiRec = reconcileResults(outcome.primary!.result, outcome.verifier?.result);
      outcome.reconciliation = {
        ...aiRec,
        score: round3(0.6 * passrate + 0.4 * aiRec.score),
      };
      return outcome;
    },
  };
}

function mediaGrader(version: string, rubric: Rubric, includeFrames: boolean): StageGrader {
  return {
    version,
    async grade(attempt, _ctx: GraderContext) {
      const transcript = await ensureTranscript(attempt);
      if (!transcript.ready) {
        return {
          pending: true,
          pending_delay_ms: transcript.delay_ms ?? 15_000,
          pending_reason: 'waiting_for_transcript',
        };
      }

      const frames = includeFrames && transcript.transcript?.source_s3_key
        ? await sampleVideoFrames({ attemptId: attempt.id, sourceS3Key: transcript.transcript.source_s3_key })
        : [];
      const transcriptFlags = transcript.transcript?.flags ?? [];
      const quality = transcript.transcript?.text
        ? estimateTextQuality(transcript.transcript.text)
        : 20;
      const fallback = {
        ...fallbackFromRubric(rubric, quality),
        flags: transcriptFlags,
        confidence: transcript.failed ? 0.35 : 0.7,
      };

      const outcome = await runTwoPassAi({
        version,
        rubric,
        attempt,
        candidateInput: {
          transcript: transcript.transcript?.text ?? '',
          word_confidence: transcript.transcript?.word_confidence ?? [],
          prosody: transcript.transcript?.prosody ?? null,
          frame_refs: frames.slice(0, 6),
          media_flags: transcriptFlags,
        },
        fallback,
      });

      if (transcriptFlags.length) {
        for (const run of [outcome.primary, outcome.verifier]) {
          if (!run) continue;
          run.result.flags = Array.from(new Set([...run.result.flags, ...transcriptFlags]));
        }
      }
      outcome.reconciliation = reconcileResults(outcome.primary!.result, outcome.verifier?.result);
      return outcome;
    },
  };
}

async function runTwoPassAi(args: {
  version: string;
  rubric: Rubric;
  attempt: StageAttemptRow;
  candidateInput: unknown;
  fallback: GraderResult;
}): Promise<GradeOutcome> {
  const primaryPrompt = buildPrimaryPrompt({
    rubric: args.rubric,
    roleSummary: roleSummary(args.attempt),
    candidateInput: args.candidateInput,
  });
  const primaryCall = await gradeWithClaude({
    ...primaryPrompt,
    fallback: args.fallback,
  });
  const primary: RunDraft = {
    pass_no: 1,
    grader_version: args.version,
    model: primaryCall.model,
    result: normalizeScoreFromSubscores(primaryCall.result, args.rubric),
    prompt_hash: primaryCall.prompt_hash,
    raw_response: primaryCall.raw_response,
    input_token_count: primaryCall.input_token_count,
    output_token_count: primaryCall.output_token_count,
    latency_ms: primaryCall.latency_ms,
    rationale: primaryCall.result.rationale,
  };

  if (process.env.GRADER_VERIFIER_ENABLED === 'false') {
    return { primary, reconciliation: reconcileResults(primary.result) };
  }

  const verifierPrompt = buildVerifierPrompt({
    rubric: args.rubric,
    roleSummary: roleSummary(args.attempt),
    candidateInput: args.candidateInput,
    primary: primary.result,
  });
  const verifierCall = await gradeWithClaude({
    ...verifierPrompt,
    fallback: primary.result,
  });
  const verifier: RunDraft = {
    pass_no: 2,
    grader_version: args.version,
    model: verifierCall.model,
    result: normalizeScoreFromSubscores(verifierCall.result, args.rubric),
    prompt_hash: verifierCall.prompt_hash,
    raw_response: verifierCall.raw_response,
    input_token_count: verifierCall.input_token_count,
    output_token_count: verifierCall.output_token_count,
    latency_ms: verifierCall.latency_ms,
    rationale: verifierCall.result.rationale,
  };

  return {
    primary,
    verifier,
    reconciliation: reconcileResults(primary.result, verifier.result),
  };
}

function deterministicRun(version: string, result: GraderResult): RunDraft {
  return {
    pass_no: 1,
    grader_version: version,
    model: DETERMINISTIC_MODEL,
    result,
    prompt_hash: `deterministic:${version}`,
    raw_response: JSON.stringify(result),
    latency_ms: 0,
    rationale: result.rationale,
  };
}

function fallbackFromRubric(rubric: Rubric, score: number): GraderResult {
  const normalized = Math.max(0, Math.min(100, round3(score)));
  return {
    score: normalized,
    subscores: Object.fromEntries(rubric.criteria.map((criterion) => [criterion.key, normalized])),
    evidence: [],
    confidence: 0.65,
    flags: [],
    rationale: 'Fallback score derived from available structured evidence.',
  };
}

function normalizeScoreFromSubscores(result: GraderResult, rubric: Rubric): GraderResult {
  const score = Object.keys(result.subscores).length
    ? weightedScore(result.subscores, rubric)
    : result.score;
  return { ...result, score: round3(score) };
}

function scoreGma(attempt: StageAttemptRow): GraderResult {
  const summary = readRecord(attempt.raw_payload.gma_summary);
  const score = readNumber(summary.score, readPercent(summary.correct, summary.total));
  return {
    score,
    subscores: { correct_rate: score },
    evidence: [{ kind: 'line_ref', value: `${summary.correct ?? '?'} of ${summary.total ?? '?'} correct` }],
    confidence: 1,
    flags: [],
    rationale: 'Key-based GMA score.',
  };
}

function scoreBig5(attempt: StageAttemptRow): GraderResult {
  const score = readNumber(attempt.raw_payload.mechanical_score, averageRecordValues(attempt.raw_payload.scores));
  const flags: Flag[] = Array.isArray(attempt.raw_payload.attention_check_failures)
    && attempt.raw_payload.attention_check_failures.length > 0
    ? ['attention_check_failed']
    : [];
  return {
    score,
    subscores: readRecordNumbers(attempt.raw_payload.scores),
    evidence: flags.length ? [{ kind: 'line_ref', value: 'Attention check failures present' }] : [],
    confidence: flags.length ? 0.75 : 1,
    flags,
    rationale: 'Mechanical Big Five score from keyed Likert answers.',
  };
}

function scoreMbti(attempt: StageAttemptRow): GraderResult {
  const score = readNumber(attempt.raw_payload.mechanical_score, readNumber(attempt.raw_payload.clarity_score, 50));
  return {
    score,
    subscores: { clarity: score },
    evidence: typeof attempt.raw_payload.type === 'string'
      ? [{ kind: 'line_ref', value: `MBTI type ${attempt.raw_payload.type}` }]
      : [],
    confidence: 1,
    flags: [],
    rationale: 'Mechanical MBTI clarity score.',
  };
}

async function resumeInput(attempt: StageAttemptRow): Promise<unknown> {
  const extraction = await ensureResumeExtractionForAttempt(attempt);
  return {
    resume_text: extraction.text,
    resume_name_guess: extraction.name_guess,
    extraction_status: extraction.status,
    extraction_truncated: extraction.truncated,
    artifact_id: extraction.artifact_id ?? attempt.raw_payload.artifact_id ?? null,
    parsed_cv: attempt.raw_payload.parsed_cv ?? null,
    role: {
      name: attempt.role_name,
      description: attempt.role_description,
    },
  };
}

function readSandbox(attempt: StageAttemptRow): Record<string, unknown> | null {
  const value = attempt.raw_payload.sandbox;
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

export function sandboxPassrate(sandbox: Record<string, unknown>): number {
  if (sandbox.timed_out === true || sandbox.oom_killed === true) return 0;
  const tests = readRecord(sandbox.tests);
  const total = readNumber(tests.total, 0);
  const passed = readNumber(tests.passed, 0);
  if (total > 0) return round3((passed / total) * 100);
  return readNumber(sandbox.exit_code, 1) === 0 ? 100 : 0;
}

function estimateTextQuality(input: unknown): number {
  const text = typeof input === 'string'
    ? input
    : JSON.stringify(input);
  const words = text.split(/\s+/).filter(Boolean).length;
  if (words < 20) return 25;
  if (words < 80) return 45;
  if (words < 180) return 62;
  if (words < 400) return 75;
  return 82;
}

function roleSummary(attempt: StageAttemptRow): string {
  const parts = [
    attempt.role_name ? `Role: ${attempt.role_name}` : 'Role: unspecified',
    attempt.role_description ? `Description: ${attempt.role_description}` : null,
  ].filter(Boolean);
  return parts.join('\n');
}

function readPercent(correct: unknown, total: unknown): number {
  const c = readNumber(correct, 0);
  const t = readNumber(total, 0);
  return t > 0 ? round3((c / t) * 100) : 0;
}

function readNumber(value: unknown, fallback: number): number {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  return Number.isFinite(n) ? round3(n) : fallback;
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function readRecordNumbers(value: unknown): Record<string, number> {
  const record = readRecord(value);
  const out: Record<string, number> = {};
  for (const [key, raw] of Object.entries(record)) {
    if (typeof raw === 'number') out[key] = round3(raw);
  }
  return out;
}

function averageRecordValues(value: unknown): number {
  const values = Object.values(readRecordNumbers(value));
  return values.length ? round3(values.reduce((sum, n) => sum + n, 0) / values.length) : 50;
}
