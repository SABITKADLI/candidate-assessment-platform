import { auditLog, sql } from '@cap/db';
import { reconcile, type GraderResult } from '@cap/graders';
import { buildPrimaryPrompt, buildVerifierPrompt } from './grading/prompts.js';
import { gradeWithClaude } from './grading/anthropic.js';
import { RUBRICS, round3, weightedScore, type Rubric } from './grading/rubrics.js';

interface CalibrationFixture {
  id: string;
  stage_key: string;
  fixture: Record<string, unknown>;
  human_score: string | number;
}

const MODEL = process.env.GRADER_MODEL ?? 'claude-sonnet-4-20250514';

async function main(): Promise<void> {
  const fixtures = await sql<CalibrationFixture[]>`
    SELECT id, stage_key::text AS stage_key, fixture, human_score
    FROM app.calibration_set
    ORDER BY created_at ASC
  `;

  let inserted = 0;
  let skipped = 0;

  for (const fixture of fixtures) {
    const rubric = rubricForStage(fixture.stage_key);
    if (!rubric) {
      skipped += 1;
      continue;
    }

    const input = fixture.fixture.input ?? fixture.fixture.raw_payload ?? fixture.fixture;
    const roleSummary = typeof fixture.fixture.role_summary === 'string'
      ? fixture.fixture.role_summary
      : 'Role: calibration fixture';
    const fallback = fallbackFromRubric(rubric);

    const primaryPrompt = buildPrimaryPrompt({ rubric, roleSummary, candidateInput: input });
    const primary = await gradeWithClaude({ ...primaryPrompt, fallback });
    const primaryResult = normalize(primary.result, rubric);

    let verifierResult: GraderResult | undefined;
    if (process.env.GRADER_VERIFIER_ENABLED !== 'false') {
      const verifierPrompt = buildVerifierPrompt({
        rubric,
        roleSummary,
        candidateInput: input,
        primary: primaryResult,
      });
      const verifier = await gradeWithClaude({ ...verifierPrompt, fallback: primaryResult });
      verifierResult = normalize(verifier.result, rubric);
    }

    const rec = reconcile(primaryResult, verifierResult);
    const score = applyHybridIfNeeded(fixture.stage_key, fixture.fixture, rec.score);
    const human = Number(fixture.human_score);
    const absError = round3(Math.abs(score - human));
    const version = versionForStage(fixture.stage_key);

    await sql`
      INSERT INTO app.calibration_runs (
        grader_version, model, fixture_id, ai_score, abs_error, flagged
      ) VALUES (
        ${version},
        ${MODEL},
        ${fixture.id}::uuid,
        ${score},
        ${absError},
        ${rec.needs_review || rec.merged_flags.length > 0}
      )
    `;
    inserted += 1;
  }

  await auditLog('scoring-worker', 'calibration.run', 'calibration:set', {
    fixtures: fixtures.length,
    inserted,
    skipped,
    model: MODEL,
  });

  console.log(JSON.stringify({ fixtures: fixtures.length, inserted, skipped, model: MODEL }, null, 2));
}

function rubricForStage(stageKey: string): Rubric | null {
  switch (stageKey) {
    case 'A_RESUME':
      return RUBRICS.A_RESUME;
    case 'A_RORSCHACH':
      return RUBRICS.A_RORSCHACH;
    case 'A_SJT':
      return RUBRICS.A_SJT;
    case 'B_WORK_SAMPLE':
      return RUBRICS.B_WORK_SAMPLE;
    case 'B_CODING':
      return RUBRICS.B_CODING;
    case 'B_DEBUG':
      return RUBRICS.B_DEBUG;
    case 'B_ASYNC_VIDEO':
      return RUBRICS.B_ASYNC_VIDEO;
    case 'B_VERBAL':
      return RUBRICS.B_VERBAL;
    default:
      return null;
  }
}

function versionForStage(stageKey: string): string {
  switch (stageKey) {
    case 'A_SJT':
      return 'a_sjt_role_fit@v1';
    case 'A_RESUME':
      return 'a_resume@v1';
    case 'A_RORSCHACH':
      return 'a_rorschach@v1';
    case 'B_WORK_SAMPLE':
      return 'b_work_sample@v1';
    case 'B_CODING':
      return 'b_coding@v1';
    case 'B_DEBUG':
      return 'b_debug@v1';
    case 'B_ASYNC_VIDEO':
      return 'b_async_video@v1';
    case 'B_VERBAL':
      return 'b_verbal@v1';
    default:
      return `${stageKey.toLowerCase()}@v1`;
  }
}

function fallbackFromRubric(rubric: Rubric): GraderResult {
  return {
    score: 50,
    subscores: Object.fromEntries(rubric.criteria.map((criterion) => [criterion.key, 50])),
    evidence: [],
    confidence: 0.5,
    flags: ['low_confidence'],
    rationale: 'Calibration fallback result.',
  };
}

function normalize(result: GraderResult, rubric: Rubric): GraderResult {
  const score = Object.keys(result.subscores).length
    ? weightedScore(result.subscores, rubric)
    : result.score;
  return { ...result, score };
}

function applyHybridIfNeeded(stageKey: string, fixture: Record<string, unknown>, aiScore: number): number {
  if (stageKey === 'A_SJT') {
    const mechanical = readNumber(fixture.mechanical_score, aiScore);
    return round3(0.7 * mechanical + 0.3 * aiScore);
  }
  if (stageKey === 'B_CODING' || stageKey === 'B_DEBUG') {
    const passrate = readNumber(fixture.test_pass_rate, aiScore);
    return round3(0.6 * passrate + 0.4 * aiScore);
  }
  return round3(aiScore);
}

function readNumber(value: unknown, fallback: number): number {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  return Number.isFinite(n) ? n : fallback;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
