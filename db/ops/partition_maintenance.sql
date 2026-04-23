-- Run daily (externally or via pg_cron) if pg_cron is not enabled.
SELECT telemetry.ensure_partitions(14);
SELECT telemetry.drop_old_partitions(90);
SELECT app.expire_sessions();
