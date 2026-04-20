# candidate-assessment-platform

Web-based two-stage developer assessment with anti-AI-agent proctoring.
See `Project_information_` for full architecture.

## Status
- **Phase 1** — DB schema (`db/`). Done.
- **Phase 2** — Monorepo scaffold (`apps/`, `packages/`). Done.

## Layout

```
apps/
  candidate/      Next.js 15, port 3000, session-token boundary
  recruiter/      Next.js 15, port 3001, Auth0 boundary
packages/
  shared/         enums + zod schemas mirroring DB enums
  db/             postgres.js client singleton + audit helpers
  config-ts/      shared tsconfig bases
db/               migrations + smoke (Phase 1)
```

## Run

```bash
# 1. install
pnpm install

# 2. point at a DB (see .env.example); apply migrations
for f in db/migrations/*.sql; do psql -v ON_ERROR_STOP=1 -d cap_dev -f "$f"; done

# 3. env per app
cp .env.example apps/candidate/.env.local
cp .env.example apps/recruiter/.env.local

# 4. dev both apps in parallel
pnpm dev
#   candidate  -> http://localhost:3000
#   recruiter  -> http://localhost:3001
```

## Auth boundaries

- **Candidate**: no login. `/s/[token]` validates an opaque `resume_token`
  against `app.sessions`, mints an `httpOnly` `cap_sess` cookie, and
  middleware gates everything else. Strict, short-lived, non-transferable.
- **Recruiter**: Auth0 v4 handles `/auth/*` (login, callback, logout).
  Middleware redirects unauthenticated users on all non-public routes.
- Apps run on separate ports (and ultimately separate subdomains) so
  cookies do not cross the boundary.

## Workspace packages

- `@cap/shared` — keep enums/zod schemas in sync with `db/migrations/0001`.
- `@cap/db` — `postgres` (postgres.js) singleton. Use `sql` for queries and
  `auditLog(actor, action, target, payload)` for audit writes (never raw INSERT).

## Next prompts
3. Custom MCP server design.
4. Docker+gVisor sandbox worker spec.
5. Client-side anti-bot/agent detection module.
