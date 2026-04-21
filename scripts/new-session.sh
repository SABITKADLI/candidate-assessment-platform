#!/usr/bin/env bash
set -euo pipefail
EMAIL="${1:-dev-$(date +%s)@example.com}"
BASE="${CANDIDATE_BASE_URL:-http://localhost:3000}"

PGPASSWORD=cap psql -h 127.0.0.1 -U cap -d cap_dev -At -c "
INSERT INTO app.roles (name) VALUES ('backend') ON CONFLICT (name) DO NOTHING;
WITH c AS (
  INSERT INTO app.candidates (email, consent_version, consent_ts)
  VALUES ('$EMAIL','v1', now()) RETURNING id
)
INSERT INTO app.sessions (candidate_id, stage, resume_token, expires_at)
SELECT id, 'A', 'tok_' || replace(gen_random_uuid()::text,'-',''), now() + interval '2 hours'
FROM c
RETURNING '$BASE/s/' || resume_token;
"
