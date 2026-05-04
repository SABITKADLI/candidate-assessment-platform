-- 0009_email_log_and_role_config.sql
-- Move recruiter runtime schema guards into the formal migration chain.

BEGIN;

ALTER TABLE app.roles ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE app.roles ADD COLUMN IF NOT EXISTS stages_a text[];
ALTER TABLE app.roles ADD COLUMN IF NOT EXISTS stages_b text[];

CREATE TABLE IF NOT EXISTS app.email_log (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  uuid        REFERENCES app.sessions(id) ON DELETE SET NULL,
  to_email    text        NOT NULL,
  resend_id   text,
  status      text        NOT NULL DEFAULT 'queued',
  attempts    int         NOT NULL DEFAULT 0,
  last_error  text,
  opened_at   timestamptz,
  clicked_at  timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE app.email_log ADD COLUMN IF NOT EXISTS opened_at timestamptz;
ALTER TABLE app.email_log ADD COLUMN IF NOT EXISTS clicked_at timestamptz;

CREATE INDEX IF NOT EXISTS email_log_session_idx
  ON app.email_log (session_id);
CREATE INDEX IF NOT EXISTS email_log_resend_id_idx
  ON app.email_log (resend_id) WHERE resend_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS email_log_created_at_idx
  ON app.email_log (created_at DESC);

COMMIT;
