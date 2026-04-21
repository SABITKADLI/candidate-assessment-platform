-- 0005_ats_outbox_and_memo.sql
-- Outbound webhook queue ("transactional outbox"). We write to this table in
-- the same transaction that publishes a score; a worker picks up rows and
-- does the actual HTTP call, so flaky ATS endpoints never block scoring.

BEGIN;

DO $$ BEGIN
  CREATE TYPE app.ats_provider AS ENUM ('greenhouse','lever','workday');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE app.outbox_status AS ENUM ('pending','delivering','delivered','failed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS app.ats_outbox (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id     uuid NOT NULL REFERENCES app.sessions(id) ON DELETE CASCADE,
  ats            app.ats_provider NOT NULL,
  payload        jsonb NOT NULL,                          -- vendor-specific body
  status         app.outbox_status NOT NULL DEFAULT 'pending',
  attempts       int NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_error     text,
  delivered_at   timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ats_outbox_ready_idx
  ON app.ats_outbox (next_attempt_at)
  WHERE status IN ('pending','failed');
CREATE INDEX IF NOT EXISTS ats_outbox_session_idx
  ON app.ats_outbox (session_id, created_at DESC);

-- Memo artifact — keep the same column name from phase 1, but ensure it's indexable.
CREATE INDEX IF NOT EXISTS scores_memo_present_idx
  ON app.scores (session_id) WHERE memo_s3_key IS NOT NULL;

COMMIT;
