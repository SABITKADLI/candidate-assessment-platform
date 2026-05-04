-- Store memo text directly in DB so recruiters can read it without S3.
-- Also capture the Claude recommendation so it can be displayed in the UI.
BEGIN;

ALTER TABLE app.scores
  ADD COLUMN IF NOT EXISTS memo_text    text,
  ADD COLUMN IF NOT EXISTS recommendation text
    CHECK (recommendation IN ('advance', 'hold', 'decline', 'unknown'));

COMMIT;
