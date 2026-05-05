-- 0012_ai_first_scoring.sql
-- AI-first grading pipeline: score runs, reconciliations, transcripts, calibration,
-- and recruiter identity bridge for human review actions.

BEGIN;

-- Minimal Auth0 -> app user bridge. Recruiter APIs upsert into this table
-- before writing reviewer/assignee foreign keys.
CREATE TABLE IF NOT EXISTS app.users (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth0_sub   text NOT NULL UNIQUE,
  email       text,
  name        text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS users_email_idx
  ON app.users (lower(email)) WHERE email IS NOT NULL;

-- Status for the async stage scoring lifecycle. Existing scored rows are
-- backfilled below.
ALTER TABLE app.stage_attempts
  ADD COLUMN IF NOT EXISTS scoring_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS scoring_error text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'stage_attempts_scoring_status_check'
      AND conrelid = 'app.stage_attempts'::regclass
  ) THEN
    ALTER TABLE app.stage_attempts
      ADD CONSTRAINT stage_attempts_scoring_status_check
      CHECK (scoring_status IN ('pending','queued','grading','reconciled','review','final','failed'));
  END IF;
END $$;

UPDATE app.stage_attempts
   SET scoring_status = CASE
     WHEN score IS NOT NULL THEN 'final'
     WHEN completed_at IS NOT NULL THEN 'queued'
     ELSE scoring_status
   END
 WHERE scoring_status = 'pending';

CREATE INDEX IF NOT EXISTS stage_attempts_scoring_status_idx
  ON app.stage_attempts (session_id, scoring_status);

CREATE TABLE IF NOT EXISTS app.score_runs (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stage_attempt_id  uuid NOT NULL REFERENCES app.stage_attempts(id) ON DELETE CASCADE,
  grader_version    text NOT NULL,
  model             text NOT NULL,
  pass_no           smallint NOT NULL,
  score             numeric(6,3),
  subscores         jsonb NOT NULL DEFAULT '{}'::jsonb,
  evidence          jsonb NOT NULL DEFAULT '[]'::jsonb,
  confidence        numeric(4,3),
  flags             text[] NOT NULL DEFAULT '{}'::text[],
  prompt_hash       text NOT NULL,
  raw_response      text,
  input_token_count int,
  output_token_count int,
  latency_ms        int,
  created_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT score_runs_pass_no_check CHECK (pass_no IN (1, 2)),
  CONSTRAINT score_runs_score_range CHECK (score IS NULL OR (score >= 0 AND score <= 100)),
  CONSTRAINT score_runs_confidence_range CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1))
);

CREATE INDEX IF NOT EXISTS score_runs_stage_attempt_idx
  ON app.score_runs(stage_attempt_id);
CREATE INDEX IF NOT EXISTS score_runs_grader_version_idx
  ON app.score_runs(grader_version, created_at DESC);

CREATE TABLE IF NOT EXISTS app.score_reconciliations (
  stage_attempt_id  uuid PRIMARY KEY REFERENCES app.stage_attempts(id) ON DELETE CASCADE,
  primary_run_id    uuid NOT NULL REFERENCES app.score_runs(id),
  verifier_run_id   uuid REFERENCES app.score_runs(id),
  reconciled_score  numeric(6,3) NOT NULL,
  divergence        numeric(6,3),
  needs_review      boolean NOT NULL DEFAULT false,
  review_reason     text,
  reviewed_by       uuid REFERENCES app.users(id),
  reviewed_at       timestamptz,
  override_score    numeric(6,3),
  override_reason   text,
  assigned_to       uuid REFERENCES app.users(id),
  assigned_at       timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT score_reconciliations_score_range CHECK (
    reconciled_score >= 0 AND reconciled_score <= 100
    AND (override_score IS NULL OR (override_score >= 0 AND override_score <= 100))
  ),
  CONSTRAINT score_reconciliations_review_reason_check CHECK (
    review_reason IS NULL OR review_reason IN ('divergence','low_confidence','severe_flag')
  )
);

CREATE INDEX IF NOT EXISTS score_reconciliations_review_idx
  ON app.score_reconciliations (needs_review, review_reason, updated_at DESC)
  WHERE needs_review = true;
CREATE INDEX IF NOT EXISTS score_reconciliations_assigned_idx
  ON app.score_reconciliations (assigned_to, needs_review)
  WHERE assigned_to IS NOT NULL;

CREATE TABLE IF NOT EXISTS app.transcripts (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stage_attempt_id  uuid NOT NULL REFERENCES app.stage_attempts(id) ON DELETE CASCADE,
  source_s3_key     text NOT NULL,
  transcribe_job    text NOT NULL UNIQUE,
  status            text NOT NULL,
  transcript_s3_key text,
  text              text,
  word_confidence   jsonb,
  prosody           jsonb,
  created_at        timestamptz NOT NULL DEFAULT now(),
  completed_at      timestamptz,
  CONSTRAINT transcripts_status_check CHECK (status IN ('queued','in_progress','completed','failed'))
);

CREATE INDEX IF NOT EXISTS transcripts_stage_attempt_idx
  ON app.transcripts(stage_attempt_id);

CREATE TABLE IF NOT EXISTS app.calibration_set (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stage_key       app.stage_key NOT NULL,
  fixture         jsonb NOT NULL,
  human_score     numeric(6,3) NOT NULL,
  human_subscores jsonb,
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT calibration_set_score_range CHECK (human_score >= 0 AND human_score <= 100)
);

CREATE TABLE IF NOT EXISTS app.calibration_runs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grader_version  text NOT NULL,
  model           text NOT NULL,
  ran_at          timestamptz NOT NULL DEFAULT now(),
  fixture_id      uuid REFERENCES app.calibration_set(id),
  ai_score        numeric(6,3),
  abs_error       numeric(6,3),
  flagged         boolean NOT NULL DEFAULT false,
  CONSTRAINT calibration_runs_score_range CHECK (
    (ai_score IS NULL OR (ai_score >= 0 AND ai_score <= 100))
    AND (abs_error IS NULL OR abs_error >= 0)
  )
);

CREATE INDEX IF NOT EXISTS calibration_set_stage_idx
  ON app.calibration_set(stage_key, created_at DESC);
CREATE INDEX IF NOT EXISTS calibration_runs_version_idx
  ON app.calibration_runs(grader_version, ran_at DESC);
CREATE INDEX IF NOT EXISTS calibration_runs_fixture_idx
  ON app.calibration_runs(fixture_id);

DO $$ DECLARE t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY['users','score_reconciliations']) LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS trg_touch_%1$s ON app.%1$s;
       CREATE TRIGGER trg_touch_%1$s BEFORE UPDATE ON app.%1$s
       FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();', t);
  END LOOP;
END $$;

COMMIT;
