-- 0007_expire_sessions_fn.sql
-- Session expiry helper. Call periodically via the cron API route or pg_cron.

BEGIN;

CREATE OR REPLACE FUNCTION app.expire_sessions()
RETURNS int LANGUAGE plpgsql AS $$
DECLARE n int;
BEGIN
  UPDATE app.sessions
     SET status = 'expired', updated_at = now()
   WHERE expires_at < now()
     AND status IN ('pending', 'in_progress', 'paused');
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;

-- Optional: schedule via pg_cron (enable pg_cron extension first).
-- Runs every 15 minutes; adjust to taste.
-- SELECT cron.schedule('expire_sessions', '*/15 * * * *',
--   $$SELECT app.expire_sessions();$$);

COMMIT;
