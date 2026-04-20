-- 0001_extensions_and_enums.sql
-- Extensions and shared enums. Idempotent.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;       -- gen_random_uuid, digest
CREATE EXTENSION IF NOT EXISTS pg_trgm;        -- fuzzy search on emails/names later
CREATE EXTENSION IF NOT EXISTS btree_gin;      -- composite indexes on jsonb + scalars
-- Optional; enable in Supabase dashboard if you want cron-driven partition maintenance:
-- CREATE EXTENSION IF NOT EXISTS pg_cron;
-- CREATE EXTENSION IF NOT EXISTS pg_partman;

-- Dedicated schemas
CREATE SCHEMA IF NOT EXISTS app;
CREATE SCHEMA IF NOT EXISTS telemetry;
CREATE SCHEMA IF NOT EXISTS audit;

-- ---- ENUMS ----------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE app.stage_key AS ENUM (
    'A_RESUME','A_ID_LIVENESS','A_GMA','A_BIG5','A_MBTI','A_RORSCHACH',
    'A_INTEGRITY','A_SJT',
    'B_CODING','B_DEBUG','B_WORK_SAMPLE','B_ASYNC_VIDEO','B_VERBAL'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE app.stage_group AS ENUM ('A','B');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE app.session_status AS ENUM (
    'pending','in_progress','paused','completed','expired','abandoned','disqualified'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE app.artifact_kind AS ENUM (
    'resume','code','audio','video','screenshot','webcam_frame','liveness','work_sample','transcript'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE app.flag_severity AS ENUM ('info','low','medium','high','critical');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMIT;
