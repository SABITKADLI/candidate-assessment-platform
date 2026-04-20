-- Smoke test. Run after applying migrations on a throwaway DB:
--   psql -f db/migrations/0001_extensions_and_enums.sql
--   psql -f db/migrations/0002_core_tables.sql
--   psql -f db/migrations/0003_telemetry_partitioned.sql
--   psql -f db/migrations/0004_audit_log_hashchain.sql
--   psql -f db/seed/smoke.sql

BEGIN;

-- Roles + candidate + session
INSERT INTO app.roles (name) VALUES ('backend_engineer') RETURNING id \gset role_
INSERT INTO app.candidates (email, consent_version, consent_ts)
  VALUES ('alice@example.com','v1.0', now()) RETURNING id \gset cand_

INSERT INTO app.sessions (candidate_id, role_id, stage, resume_token, expires_at)
  VALUES (:'cand_id', :'role_id', 'A', 'tok_' || gen_random_uuid()::text, now() + interval '2 hours')
  RETURNING id \gset sess_

-- Stage attempt
INSERT INTO app.stage_attempts (session_id, stage_key, raw_payload)
  VALUES (:'sess_id', 'A_GMA', '{"items_answered":12}'::jsonb);

-- Telemetry (routes to today's partition)
INSERT INTO telemetry.telemetry_events (session_id, stage_key, type, payload)
  VALUES (:'sess_id','A_GMA','paste','{"source":"external"}'::jsonb),
         (:'sess_id','A_GMA','tab_blur','{"ms":3400}'::jsonb);

-- Audit (uses helper)
SELECT audit.log('system','session.create', 'session:' || :'sess_id', '{"stage":"A"}'::jsonb);
SELECT audit.log('recruiter:42','flag.review', 'session:' || :'sess_id', '{"severity":"medium"}'::jsonb);

-- Verify chain
SELECT * FROM audit.verify_chain();

-- Tamper test (expect error)
DO $$ BEGIN
  BEGIN
    UPDATE audit.audit_log SET actor = 'mallory' WHERE seq = 1;
    RAISE EXCEPTION 'tamper protection failed';
  EXCEPTION WHEN others THEN
    RAISE NOTICE 'update blocked as expected: %', SQLERRM;
  END;
END $$;

COMMIT;
