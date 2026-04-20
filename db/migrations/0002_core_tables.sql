-- 0002_core_tables.sql
-- Core domain tables (non-partitioned, non-audit).

BEGIN;

-- ---- roles -----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS app.roles (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name           text NOT NULL UNIQUE,
  stage_weights  jsonb NOT NULL DEFAULT jsonb_build_object(
                   'gma',20,'work_sample',20,'coding',20,'verbal',15,
                   'sjt',10,'big5_mbti',8,'integrity',5,'rorschach',2),
  sjt_bank_id    uuid,
  weights_version int NOT NULL DEFAULT 1,
  active         boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT stage_weights_is_object CHECK (jsonb_typeof(stage_weights) = 'object')
);

-- ---- candidates ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS app.candidates (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email             text,                     -- nullable until consent step completes
  email_norm        text GENERATED ALWAYS AS (lower(email)) STORED,
  consent_version   text NOT NULL,
  consent_ts        timestamptz NOT NULL,
  fingerprint_hash  text,                     -- FingerprintJS Pro visitorId + custom
  pii_locator       text,                     -- optional S3 ref if PII is vaulted
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
-- Uniqueness enforced on normalized email; citext skipped for portability.

CREATE UNIQUE INDEX IF NOT EXISTS candidates_email_norm_uk
  ON app.candidates (email_norm) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS candidates_fingerprint_idx
  ON app.candidates (fingerprint_hash) WHERE fingerprint_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS candidates_created_at_idx
  ON app.candidates (created_at DESC);

-- ---- sessions --------------------------------------------------------------
CREATE TABLE IF NOT EXISTS app.sessions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id   uuid NOT NULL REFERENCES app.candidates(id) ON DELETE CASCADE,
  role_id        uuid REFERENCES app.roles(id) ON DELETE SET NULL,
  stage          app.stage_group NOT NULL,
  status         app.session_status NOT NULL DEFAULT 'pending',
  resume_token   text NOT NULL UNIQUE,        -- opaque, server-side rotated
  ip_hash        text,
  ua_hash        text,
  started_at     timestamptz,
  completed_at   timestamptz,
  expires_at     timestamptz NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sessions_time_sanity CHECK (completed_at IS NULL OR started_at IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS sessions_candidate_idx    ON app.sessions (candidate_id, created_at DESC);
CREATE INDEX IF NOT EXISTS sessions_status_idx       ON app.sessions (status) WHERE status IN ('in_progress','paused');
CREATE INDEX IF NOT EXISTS sessions_stage_status_idx ON app.sessions (stage, status);
CREATE INDEX IF NOT EXISTS sessions_expires_idx      ON app.sessions (expires_at) WHERE status IN ('pending','in_progress','paused');

-- ---- stage_attempts --------------------------------------------------------
CREATE TABLE IF NOT EXISTS app.stage_attempts (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id   uuid NOT NULL REFERENCES app.sessions(id) ON DELETE CASCADE,
  stage_key    app.stage_key NOT NULL,
  attempt_no   smallint NOT NULL DEFAULT 1,
  score        numeric(6,3),                  -- 0..100, null until scored
  raw_payload  jsonb NOT NULL DEFAULT '{}'::jsonb,
  duration_s   integer,
  started_at   timestamptz,
  completed_at timestamptz,
  scored_at    timestamptz,
  weights_version int,
  UNIQUE (session_id, stage_key, attempt_no),
  CONSTRAINT attempts_score_range CHECK (score IS NULL OR (score >= 0 AND score <= 100)),
  CONSTRAINT attempts_duration_nonneg CHECK (duration_s IS NULL OR duration_s >= 0)
);

CREATE INDEX IF NOT EXISTS stage_attempts_session_idx ON app.stage_attempts (session_id);
CREATE INDEX IF NOT EXISTS stage_attempts_stage_idx   ON app.stage_attempts (stage_key);
CREATE INDEX IF NOT EXISTS stage_attempts_payload_gin ON app.stage_attempts USING gin (raw_payload jsonb_path_ops);

-- ---- artifacts -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS app.artifacts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id    uuid NOT NULL REFERENCES app.sessions(id) ON DELETE CASCADE,
  stage_key     app.stage_key,
  kind          app.artifact_kind NOT NULL,
  s3_key        text NOT NULL,
  sha256        bytea NOT NULL,               -- content hash for integrity
  size_bytes    bigint NOT NULL,
  mime_type     text,
  encrypted     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT artifacts_hash_len CHECK (octet_length(sha256) = 32),
  CONSTRAINT artifacts_size_nonneg CHECK (size_bytes >= 0)
);

CREATE INDEX IF NOT EXISTS artifacts_session_idx  ON app.artifacts (session_id, created_at DESC);
CREATE INDEX IF NOT EXISTS artifacts_kind_idx     ON app.artifacts (kind);
CREATE UNIQUE INDEX IF NOT EXISTS artifacts_s3_key_uk ON app.artifacts (s3_key);

-- ---- proctoring_flags ------------------------------------------------------
CREATE TABLE IF NOT EXISTS app.proctoring_flags (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id   uuid NOT NULL REFERENCES app.sessions(id) ON DELETE CASCADE,
  stage_key    app.stage_key,
  severity     app.flag_severity NOT NULL,
  reason       text NOT NULL,                 -- short machine code e.g. "gaze.off_screen"
  details      jsonb NOT NULL DEFAULT '{}'::jsonb,
  evidence_ref uuid REFERENCES app.artifacts(id) ON DELETE SET NULL,
  resolved     boolean NOT NULL DEFAULT false,
  resolved_by  text,
  resolved_at  timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pflags_session_idx  ON app.proctoring_flags (session_id, created_at DESC);
CREATE INDEX IF NOT EXISTS pflags_open_idx     ON app.proctoring_flags (severity) WHERE resolved = false;
CREATE INDEX IF NOT EXISTS pflags_reason_idx   ON app.proctoring_flags (reason);

-- ---- scores ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS app.scores (
  session_id       uuid PRIMARY KEY REFERENCES app.sessions(id) ON DELETE CASCADE,
  composite        numeric(6,3) NOT NULL,
  per_stage        jsonb NOT NULL,             -- {"gma":72.1,"coding":81.2,...}
  proctoring_mult  numeric(4,3) NOT NULL DEFAULT 1.000, -- 0.5..1.0
  weights_version  int NOT NULL,
  memo_s3_key      text,                       -- Claude-generated 1-pager
  computed_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT scores_composite_range CHECK (composite >= 0 AND composite <= 100),
  CONSTRAINT scores_mult_range      CHECK (proctoring_mult >= 0.5 AND proctoring_mult <= 1.0)
);

CREATE INDEX IF NOT EXISTS scores_composite_idx ON app.scores (composite DESC);

-- ---- updated_at triggers ---------------------------------------------------
CREATE OR REPLACE FUNCTION app.touch_updated_at() RETURNS trigger AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$ LANGUAGE plpgsql;

DO $$ DECLARE t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY['roles','candidates','sessions']) LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS trg_touch_%1$s ON app.%1$s;
       CREATE TRIGGER trg_touch_%1$s BEFORE UPDATE ON app.%1$s
       FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();', t);
  END LOOP;
END $$;

COMMIT;
