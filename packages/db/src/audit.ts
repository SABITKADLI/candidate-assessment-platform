import { sql } from './client.js';

/** Append a row to audit.audit_log via the SQL helper (hash chain enforced). */
export async function auditLog(
  actor: string,
  action: string,
  target: string | null = null,
  payload: Record<string, unknown> = {},
): Promise<bigint> {
  const [row] = await sql<{ seq: string }[]>`
    SELECT audit.log(${actor}, ${action}, ${target}, ${sql.json(payload)}) AS seq
  `;
  // postgres.js returns bigint as string; normalize.
  return BigInt(row!.seq);
}

/** Walk the chain; throws on tamper. */
export async function verifyAuditChain(): Promise<{ checked: bigint }> {
  const [row] = await sql<{ ok: boolean; first_bad_seq: string | null; checked: string }[]>`
    SELECT * FROM audit.verify_chain()
  `;
  if (!row!.ok) {
    throw new Error(`audit chain broken at seq=${row!.first_bad_seq}`);
  }
  return { checked: BigInt(row!.checked) };
}
