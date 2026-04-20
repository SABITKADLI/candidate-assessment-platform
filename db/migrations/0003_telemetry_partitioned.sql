-- 0003_telemetry_partitioned.sql
-- High-volume proctoring signal stream. Daily RANGE partitions by `ts`.
--
-- Why daily: proctoring emits O(100) events/candidate/session; at scale this
-- table dominates write volume. Daily partitions give cheap drops (retention
-- policy), small indexes per partition, and fast range scans per session/day.
--
-- Strategy:
--   * Declarative partitioning: PARTITION BY RANGE (ts).
--   * Primary key (id, ts) — ts required because it's the partition key.
--   * No FK from telemetry -> sessions (write-path perf); integrity enforced
--     at ingress. Orphan cleanup handled by retention + application checks.
--   * Maintenance function precreates next N days + drops partitions past
--     retention. Run via pg_cron daily, or an external scheduler.

BEGIN;

CREATE TABLE IF NOT EXISTS telemetry.telemetry_events (
  id          uuid NOT NULL DEFAULT gen_random_uuid(),
  session_id  uuid NOT NULL,
  stage_key   app.stage_key,
  type        text NOT NULL,                  -- e.g. "paste","tab_blur","gaze.off","kd.flight"
  payload     jsonb NOT NULL DEFAULT '{}'::jsonb,
  ts          timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id, ts)
) PARTITION BY RANGE (ts);

-- Default partition catches strays so inserts never fail on missing partition.
CREATE TABLE IF NOT EXISTS telemetry.telemetry_events_default
  PARTITION OF telemetry.telemetry_events DEFAULT;

-- Indexes on parent propagate to all partitions.
CREATE INDEX IF NOT EXISTS telemetry_session_ts_idx
  ON telemetry.telemetry_events (session_id, ts DESC);
CREATE INDEX IF NOT EXISTS telemetry_type_idx
  ON telemetry.telemetry_events (type);
CREATE INDEX IF NOT EXISTS telemetry_payload_gin
  ON telemetry.telemetry_events USING gin (payload jsonb_path_ops);

-- ---- partition maintenance -------------------------------------------------
-- ensure_partitions(days_ahead) — idempotent; creates tomorrow..+days_ahead.
CREATE OR REPLACE FUNCTION telemetry.ensure_partitions(days_ahead int DEFAULT 7)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  d date;
  part_name text;
  start_ts timestamptz;
  end_ts   timestamptz;
BEGIN
  FOR i IN 0..days_ahead LOOP
    d := (current_date + i);
    part_name := format('telemetry_events_%s', to_char(d, 'YYYYMMDD'));
    start_ts  := d::timestamptz;
    end_ts    := (d + 1)::timestamptz;
    EXECUTE format(
      'CREATE TABLE IF NOT EXISTS telemetry.%I
         PARTITION OF telemetry.telemetry_events
         FOR VALUES FROM (%L) TO (%L);',
      part_name, start_ts, end_ts);
  END LOOP;
END $$;

-- drop_old_partitions(retain_days) — drops partitions whose end is older than
-- now() - retain_days. Leaves the DEFAULT partition alone.
CREATE OR REPLACE FUNCTION telemetry.drop_old_partitions(retain_days int DEFAULT 90)
RETURNS int LANGUAGE plpgsql AS $$
DECLARE
  r record;
  dropped int := 0;
  cutoff date := current_date - retain_days;
BEGIN
  FOR r IN
    SELECT c.relname
    FROM pg_inherits i
    JOIN pg_class c      ON c.oid = i.inhrelid
    JOIN pg_namespace n  ON n.oid = c.relnamespace
    JOIN pg_class p      ON p.oid = i.inhparent
    WHERE n.nspname = 'telemetry'
      AND p.relname = 'telemetry_events'
      AND c.relname ~ '^telemetry_events_[0-9]{8}$'
      AND to_date(substring(c.relname from 'telemetry_events_([0-9]{8})'), 'YYYYMMDD') < cutoff
  LOOP
    EXECUTE format('DROP TABLE IF EXISTS telemetry.%I;', r.relname);
    dropped := dropped + 1;
  END LOOP;
  RETURN dropped;
END $$;

-- Bootstrap: create today + next 14 days so migrations leave the DB usable.
SELECT telemetry.ensure_partitions(14);

-- ---- scheduling (enable pg_cron first) -------------------------------------
-- SELECT cron.schedule('telemetry_ensure', '0 2 * * *',
--   $$SELECT telemetry.ensure_partitions(14);$$);
-- SELECT cron.schedule('telemetry_retain', '30 2 * * *',
--   $$SELECT telemetry.drop_old_partitions(90);$$);

COMMIT;
