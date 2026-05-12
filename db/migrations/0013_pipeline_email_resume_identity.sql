-- 0013_pipeline_email_resume_identity.sql
-- Pipeline handoff, resilient Resend reconciliation, and richer grading evidence.

BEGIN;

ALTER TABLE app.sessions
  ADD COLUMN IF NOT EXISTS pipeline_id uuid;

CREATE INDEX IF NOT EXISTS sessions_pipeline_stage_idx
  ON app.sessions (pipeline_id, stage, created_at)
  WHERE pipeline_id IS NOT NULL;

ALTER TABLE app.email_log
  ADD COLUMN IF NOT EXISTS purpose text NOT NULL DEFAULT 'invite',
  ADD COLUMN IF NOT EXISTS last_event text,
  ADD COLUMN IF NOT EXISTS last_event_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_polled_at timestamptz;

CREATE INDEX IF NOT EXISTS email_log_purpose_idx
  ON app.email_log (purpose, created_at DESC);
CREATE INDEX IF NOT EXISTS email_log_poll_idx
  ON app.email_log (last_polled_at, updated_at)
  WHERE resend_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS email_log_pipeline_stage_b_once_idx
  ON app.email_log (session_id, purpose)
  WHERE session_id IS NOT NULL AND purpose = 'pipeline_stage_b_auto';

CREATE TABLE IF NOT EXISTS app.email_webhook_events (
  id               text PRIMARY KEY,
  resend_id        text,
  event_type       text NOT NULL,
  event_created_at timestamptz,
  payload          jsonb NOT NULL DEFAULT '{}'::jsonb,
  received_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS email_webhook_events_resend_idx
  ON app.email_webhook_events (resend_id, event_created_at DESC)
  WHERE resend_id IS NOT NULL;

ALTER TABLE app.score_runs
  ADD COLUMN IF NOT EXISTS rationale text;

ALTER TABLE app.artifacts
  ADD COLUMN IF NOT EXISTS upload_kind text;

CREATE INDEX IF NOT EXISTS artifacts_upload_kind_idx
  ON app.artifacts (session_id, stage_key, upload_kind, created_at DESC)
  WHERE upload_kind IS NOT NULL;

COMMIT;
