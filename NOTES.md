# phase 7 — stage completion handler

## Files added (extracted by the tar)
- `packages/shared/src/queues.ts` — shared queue names + `ScoringJob` type
- `apps/candidate/lib/queues.ts` — lazy BullMQ producer for the candidate app
- `apps/candidate/app/api/stages/complete/route.ts` — the handler

## Manual edits needed (tar can't safely merge package.json)

1. Export the new submodule from `@cap/shared`:

```diff
 // packages/shared/package.json
 "exports": {
   ".": "./src/index.ts",
   "./enums": "./src/enums.ts",
-  "./schemas": "./src/schemas.ts"
+  "./schemas": "./src/schemas.ts",
+  "./queues": "./src/queues.ts"
 }
```

2. Add BullMQ deps to the candidate app:

```diff
 // apps/candidate/package.json
 "dependencies": {
   "next": "^15.5.0",
   "react": "^19.0.0",
   "react-dom": "^19.0.0",
   "@cap/shared": "workspace:*",
   "@cap/db": "workspace:*",
   "@cap/antibot": "workspace:*",
+  "bullmq": "^5.21.2",
+  "ioredis": "^5.4.1",
   "zod": "^3.23.8"
 },
```

## Smoke test

```bash
# from the project root, Postgres + Redis already running
psql -h 127.0.0.1 -U cap -d cap_dev -c \
  "INSERT INTO app.roles (name) VALUES ('backend') ON CONFLICT DO NOTHING;
   WITH c AS (INSERT INTO app.candidates (email, consent_version, consent_ts)
              VALUES ('t@x','v1',now()) RETURNING id)
   INSERT INTO app.sessions (candidate_id, stage, resume_token, expires_at)
   SELECT id, 'A', 'tok_' || gen_random_uuid()::text, now() + interval '2 hours'
   FROM c RETURNING id, resume_token;"

# open the resume link in a browser to get the cap_sess cookie
# http://localhost:3000/s/<resume_token>

# then post to the handler (reuse the browser cookie with --cookie)
curl -s -X POST http://localhost:3000/api/stages/complete \
  -H 'Content-Type: application/json' \
  --cookie "cap_sess=<session_uuid>" \
  -d '{"stage_key":"A_GMA","payload":{"items_answered":50},"score":72.5}'
# -> {"ok":true}
```

## Verify

```sql
SELECT stage_key, score, completed_at FROM app.stage_attempts
 WHERE session_id = '<uuid>' ORDER BY completed_at;

SELECT action, target, payload FROM audit.audit_log
 WHERE target = 'session:<uuid>' ORDER BY seq DESC LIMIT 5;
-- expect: stage.complete rows; scoring.enqueue only after the LAST stage in the group
```

## Notes on the design

- The handler is stage-level, not question-level. One POST == one stage done.
- Re-posting the same stage while in progress is idempotent — we ON CONFLICT
  merge the payload and update score/duration. We do NOT enqueue scoring on
  every POST; only when every stage in the group has `completed_at`.
- Scoring enqueue is inside the same DB transaction as the attempt update and
  the `stage.complete` audit entry. If BullMQ is unreachable, the stage still
  commits; the job just isn't enqueued (audit records `job_id: null`). A
  reconciler later can replay missing jobs; that's a future phase if needed.
- No group-transition logic here (A→B). That's a separate handler: the
  recruiter side invites the candidate to Stage B based on Stage A composite,
  creating a new `app.sessions` row with `stage='B'`.
