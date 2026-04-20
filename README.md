# candidate-assessment-platform

Web-based two-stage developer assessment with anti-AI-agent proctoring.
See `Project_information_` for full architecture.

## Status
Bootstrapped: **DB schema only** (Phase 1, prompt 1).

## Apply migrations

```bash
# local (Postgres 14+ recommended; tested on 16)
createdb cap_dev
for f in db/migrations/*.sql; do
  psql -v ON_ERROR_STOP=1 -d cap_dev -f "$f"
done

# smoke test
psql -v ON_ERROR_STOP=1 -d cap_dev -f db/seed/smoke.sql
```

Supabase: run the same files in SQL editor, in numeric order.

## Schema layout

| Schema      | Purpose                                                    |
|-------------|------------------------------------------------------------|
| `app`       | Domain tables: candidates, roles, sessions, attempts, etc. |
| `telemetry` | High-volume proctoring events (daily range partitions).    |
| `audit`     | Append-only hash-chained audit log.                        |

### Key design decisions

- **Telemetry partitioning**: daily `RANGE` on `ts`. Drops are O(metadata),
  per-partition indexes stay small. No FK to `app.sessions` to keep the
  write path fast — referential integrity enforced at ingress + retention.
  `telemetry.ensure_partitions(days_ahead)` and
  `telemetry.drop_old_partitions(retain_days)` handle maintenance; wire to
  `pg_cron` (commented in `0003`) or run `db/ops/partition_maintenance.sql`
  externally.

- **Audit hash chain**: `audit.audit_log_head` is a single locked row that
  serializes inserts so concurrent writers can't fork the chain. Each row's
  `row_hash = sha256(prev_hash || canonical(seq,id,actor,action,target,payload,ts))`.
  UPDATE/DELETE blocked by trigger; revoke grants in production.
  Verify with `SELECT * FROM audit.verify_chain();`. Always write via
  `audit.log(actor, action, target, payload)`.

- **Score multiplier**: `scores.proctoring_mult` constrained to `[0.5, 1.0]`
  per the design doc — proctoring penalizes, never rewards.

- **Soft-uniqueness on email**: `email_norm` (generated lower-case) +
  partial unique index. Avoided `citext` for portability.

## Next prompts

2. Next.js 15 monorepo scaffold (`apps/candidate`, `apps/recruiter`, `packages/shared`).
3. Custom MCP server design.
4. Docker+gVisor sandbox worker spec.
5. Client-side anti-bot/agent detection module.
