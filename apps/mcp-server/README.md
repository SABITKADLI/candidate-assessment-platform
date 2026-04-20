# @cap/mcp-server

Custom MCP server exposing candidate data to the recruiter-side Claude.

## Tools

| Tool                    | Scopes required                         | Rate limit (1m) |
|-------------------------|-----------------------------------------|-----------------|
| `search_candidates`     | `candidates:read`                       | 60              |
| `get_candidate_report`  | `candidates:read`                       | 30              |
| `replay_session`        | `candidates:read` + `sessions:replay`   | 10              |
| `flag_for_review`       | `flags:write`                           | 30              |
| `push_to_ats`           | `ats:push`                              | 10              |

PII (email, resume key) is redacted unless the caller carries `candidates:read.pii`.

## Auth

Auth0 JWT (RS256), audience = our API identifier. Same tokens the recruiter
Next.js app issues — Claude attaches them via `Authorization: Bearer …` on
the MCP HTTP transport.

Scopes are issued via Auth0 RBAC on the application/user. The server verifies
token + audience + issuer via JWKS; no opaque token introspection.

## Transport

MCP Streamable HTTP at `POST /mcp`. Per-request a short-lived `McpServer` is
instantiated bound to the verified principal; tool callbacks look the
principal up via a process-local map keyed by `sub`.

## Rate limits

Redis sliding window per `(sub, tool)`. Lua script is atomic and returns
`{allowed, remaining, retry_after_ms}`. Set `REDIS_URL`.

## Audits

- `flag_for_review` and `push_to_ats` always append to `audit.audit_log` via
  the `audit.log()` helper (hash-chained; see `db/migrations/0004`).
- `get_candidate_report` and `replay_session` also append read-audit entries
  so recruiter Claude activity is reviewable.

## Env

```
AUTH0_ISSUER=https://your-tenant.us.auth0.com/
AUTH0_AUDIENCE=https://cap.example.com/mcp
REDIS_URL=redis://127.0.0.1:6379
DATABASE_URL=postgres://...
S3_PRESIGN_URL=http://candidate-app:3000/api/internal/presign   # optional
PORT=8787
LOG_LEVEL=info
```

## Not included here (intentional)

- **S3 creds** — MCP server never holds them. A separate app-tier endpoint
  presigns memo URLs; MCP only calls that endpoint.
- **ATS HTTP calls** — `push_to_ats` enqueues via `audit.log`; a worker drains
  `mcp.push_to_ats.request` entries and performs the outbound call. Isolates
  retry, backoff, and vendor secrets from the MCP surface.

## Dev

```bash
pnpm --filter @cap/mcp-server dev
# POST /mcp with a valid Auth0 access token
```
