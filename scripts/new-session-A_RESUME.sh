#!/usr/bin/env bash
# Dev helper: create a session that lands on A_RESUME (first stage — nothing pre-seeded).
set -euo pipefail
EMAIL="${1:-dev-$(date +%s)@example.com}"
BASE="${CANDIDATE_BASE_URL:-http://localhost:3000}"

docker exec cap-postgres psql -U cap -d cap_dev -At -c "
INSERT INTO app.roles (name) VALUES ('backend') ON CONFLICT (name) DO NOTHING;
WITH c AS (
  INSERT INTO app.candidates (email, consent_version, consent_ts)
  VALUES ('$EMAIL','v1', now()) RETURNING id
),
s AS (
  INSERT INTO app.sessions (candidate_id, stage, status, resume_token, expires_at, started_at)
  SELECT id, 'A', 'in_progress', 'tok_' || replace(gen_random_uuid()::text,'-',''), now() + interval '2 hours', now()
  FROM c
  RETURNING resume_token
)
SELECT '$BASE/s/' || resume_token FROM s;
"
