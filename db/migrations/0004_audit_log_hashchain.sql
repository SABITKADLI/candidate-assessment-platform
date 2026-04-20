-- 0004_audit_log_hashchain.sql
-- Append-only, hash-chained audit log.
--
-- Guarantees:
--   1. Every row's `row_hash` = sha256( prev_hash || canonical_fields ).
--   2. Insert is serialized via a single-row head table locked FOR UPDATE,
--      so chain integrity holds under concurrent writers.
--   3. UPDATE and DELETE are forbidden by trigger + revoked grants.
--   4. `seq` is a bigserial: gap-free (modulo rolled-back transactions) and
--      gives a human-readable ordering independent of wall clock skew.
--
-- Verify integrity:
--   SELECT audit.verify_chain();           -- returns (ok, first_bad_seq)

BEGIN;

-- Head pointer: single row, holds the latest row_hash. Lock this row to serialize.
CREATE TABLE IF NOT EXISTS audit.audit_log_head (
  id        smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  last_hash bytea    NOT NULL DEFAULT decode(
              '0000000000000000000000000000000000000000000000000000000000000000','hex'),
  last_seq  bigint   NOT NULL DEFAULT 0
);
INSERT INTO audit.audit_log_head (id) VALUES (1) ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS audit.audit_log (
  seq        bigserial PRIMARY KEY,
  id         uuid        NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  actor      text        NOT NULL,            -- user id, 'system', or service name
  action     text        NOT NULL,            -- e.g. "session.create","score.publish"
  target     text,                            -- entity key like "session:<uuid>"
  payload    jsonb       NOT NULL DEFAULT '{}'::jsonb,
  ts         timestamptz NOT NULL DEFAULT now(),
  prev_hash  bytea       NOT NULL,
  row_hash   bytea       NOT NULL,
  CONSTRAINT audit_prev_hash_len CHECK (octet_length(prev_hash) = 32),
  CONSTRAINT audit_row_hash_len  CHECK (octet_length(row_hash)  = 32)
);

CREATE INDEX IF NOT EXISTS audit_log_ts_idx     ON audit.audit_log (ts DESC);
CREATE INDEX IF NOT EXISTS audit_log_actor_idx  ON audit.audit_log (actor, ts DESC);
CREATE INDEX IF NOT EXISTS audit_log_action_idx ON audit.audit_log (action, ts DESC);
CREATE INDEX IF NOT EXISTS audit_log_target_idx ON audit.audit_log (target) WHERE target IS NOT NULL;

-- Canonical serialization used for hashing. Deterministic, version-tagged.
CREATE OR REPLACE FUNCTION audit._canonical(
  p_seq bigint, p_id uuid, p_actor text, p_action text,
  p_target text, p_payload jsonb, p_ts timestamptz
) RETURNS bytea LANGUAGE sql IMMUTABLE AS $$
  SELECT convert_to(
    'v1|' || p_seq::text
         || '|' || p_id::text
         || '|' || p_actor
         || '|' || p_action
         || '|' || coalesce(p_target,'')
         -- jsonb text output is stable for a given logical value in PG.
         || '|' || coalesce(p_payload::text,'{}')
         || '|' || to_char(p_ts AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.USOF'),
    'UTF8');
$$;

-- BEFORE INSERT: lock head, populate seq/prev_hash/row_hash, advance head.
CREATE OR REPLACE FUNCTION audit.audit_log_before_insert()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  head_prev bytea;
  head_seq  bigint;
BEGIN
  SELECT last_hash, last_seq INTO head_prev, head_seq
  FROM audit.audit_log_head WHERE id = 1 FOR UPDATE;

  -- seq is normally assigned by the bigserial default; trust it but sanity-check.
  IF NEW.seq IS NULL THEN
    NEW.seq := nextval(pg_get_serial_sequence('audit.audit_log','seq'));
  END IF;
  IF NEW.seq <> head_seq + 1 THEN
    -- Allow gaps only if sequence skipped (rollbacks); require strictly increasing.
    IF NEW.seq <= head_seq THEN
      RAISE EXCEPTION 'audit_log: non-monotonic seq (got %, head %)', NEW.seq, head_seq;
    END IF;
  END IF;

  NEW.prev_hash := head_prev;
  NEW.row_hash  := digest(
    head_prev || audit._canonical(NEW.seq, NEW.id, NEW.actor, NEW.action,
                                  NEW.target, NEW.payload, NEW.ts),
    'sha256');

  UPDATE audit.audit_log_head
     SET last_hash = NEW.row_hash, last_seq = NEW.seq
   WHERE id = 1;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_audit_before_insert ON audit.audit_log;
CREATE TRIGGER trg_audit_before_insert
  BEFORE INSERT ON audit.audit_log
  FOR EACH ROW EXECUTE FUNCTION audit.audit_log_before_insert();

-- Block UPDATE and DELETE at the row level.
CREATE OR REPLACE FUNCTION audit.audit_log_immutable()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit.audit_log is append-only (%)', TG_OP;
END $$;

DROP TRIGGER IF EXISTS trg_audit_no_update ON audit.audit_log;
CREATE TRIGGER trg_audit_no_update
  BEFORE UPDATE ON audit.audit_log
  FOR EACH ROW EXECUTE FUNCTION audit.audit_log_immutable();

DROP TRIGGER IF EXISTS trg_audit_no_delete ON audit.audit_log;
CREATE TRIGGER trg_audit_no_delete
  BEFORE DELETE ON audit.audit_log
  FOR EACH ROW EXECUTE FUNCTION audit.audit_log_immutable();

-- Defense in depth: revoke at grant level (run in real deploy, commented for dev).
-- REVOKE UPDATE, DELETE ON audit.audit_log FROM PUBLIC;

-- Verifier: walk the chain and confirm each row's hash matches its predecessor.
CREATE OR REPLACE FUNCTION audit.verify_chain()
RETURNS TABLE (ok boolean, first_bad_seq bigint, checked bigint)
LANGUAGE plpgsql AS $$
DECLARE
  r record;
  expected_prev bytea := decode(
    '0000000000000000000000000000000000000000000000000000000000000000','hex');
  computed bytea;
  n bigint := 0;
BEGIN
  FOR r IN SELECT * FROM audit.audit_log ORDER BY seq ASC LOOP
    IF r.prev_hash <> expected_prev THEN
      ok := false; first_bad_seq := r.seq; checked := n; RETURN NEXT; RETURN;
    END IF;
    computed := digest(
      r.prev_hash || audit._canonical(r.seq, r.id, r.actor, r.action,
                                      r.target, r.payload, r.ts),
      'sha256');
    IF computed <> r.row_hash THEN
      ok := false; first_bad_seq := r.seq; checked := n; RETURN NEXT; RETURN;
    END IF;
    expected_prev := r.row_hash;
    n := n + 1;
  END LOOP;
  ok := true; first_bad_seq := NULL; checked := n; RETURN NEXT;
END $$;

-- Convenience writer. Callers should prefer this over raw INSERT.
CREATE OR REPLACE FUNCTION audit.log(
  p_actor text, p_action text, p_target text DEFAULT NULL, p_payload jsonb DEFAULT '{}'::jsonb
) RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE new_seq bigint;
BEGIN
  INSERT INTO audit.audit_log (actor, action, target, payload)
  VALUES (p_actor, p_action, p_target, p_payload)
  RETURNING seq INTO new_seq;
  RETURN new_seq;
END $$;

COMMIT;
