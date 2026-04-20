import { sql, auditLog } from '@cap/db';
import type { FlagSeverity } from '@cap/shared';
import { ToolError } from '../errors.js';

export async function createFlag(args: {
  session_id: string; severity: FlagSeverity; reason: string; note?: string;
  actor: string;
}) {
  const rows = await sql<{ id: string }[]>`
    INSERT INTO app.proctoring_flags (session_id, severity, reason, details)
    VALUES (${args.session_id}::uuid, ${args.severity}::app.flag_severity,
            ${args.reason},
            ${sql.json({ note: args.note ?? null, source: 'mcp.flag_for_review' } as never)})
    RETURNING id
  `;
  const id = rows[0]?.id;
  if (!id) throw new ToolError('insert_failed', 'could not create flag', 500);

  await auditLog(args.actor, 'flag.create', `session:${args.session_id}`, {
    flag_id: id, severity: args.severity, reason: args.reason,
  });
  return { flag_id: id };
}

export type AtsProvider = 'greenhouse' | 'lever' | 'workday';

export async function pushToAts(args: {
  session_id: string; ats: AtsProvider; stage_id?: string; note?: string; actor: string;
}) {
  // Webhook dispatch is outside this MCP server — we enqueue, the worker pushes.
  // Deliberately writing to audit_log only here; the worker reads by target+action.
  const seq = await auditLog(args.actor, 'ats.push.request', `session:${args.session_id}`, {
    ats: args.ats, stage_id: args.stage_id ?? null, note: args.note ?? null,
  });
  return { enqueued_seq: seq.toString(), ats: args.ats };
}
