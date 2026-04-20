import { sql } from '@cap/db';
import type { StageKey } from '@cap/shared';

export interface ReplayFilter {
  session_id: string;
  stage_key?: StageKey;
  since?: string;           // ISO
  until?: string;           // ISO
  types?: string[];         // allow-list filter
  limit?: number;           // 1..1000
  cursor?: string;          // opaque: base64("<iso_ts>|<uuid>")
}

export interface Event {
  id: string;
  ts: string;
  stage_key: StageKey | null;
  type: string;
  payload: unknown;
}

export async function replay(f: ReplayFilter): Promise<{ events: Event[]; next_cursor: string | null }> {
  const limit = Math.min(Math.max(f.limit ?? 200, 1), 1000);
  const [cTs, cId] = decodeCursor(f.cursor);

  const rows = await sql<Array<{
    id: string; ts: Date; stage_key: StageKey | null; type: string; payload: unknown;
  }>>`
    SELECT id, ts, stage_key, type, payload
    FROM telemetry.telemetry_events
    WHERE session_id = ${f.session_id}::uuid
      ${f.stage_key ? sql`AND stage_key = ${f.stage_key}::app.stage_key` : sql``}
      ${f.since ? sql`AND ts >= ${f.since}::timestamptz` : sql``}
      ${f.until ? sql`AND ts <  ${f.until}::timestamptz` : sql``}
      ${f.types && f.types.length ? sql`AND type = ANY(${f.types})` : sql``}
      ${cTs && cId ? sql`AND (ts, id) > (${cTs}::timestamptz, ${cId}::uuid)` : sql``}
    ORDER BY ts ASC, id ASC
    LIMIT ${limit + 1}
  `;

  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit);
  const last = page[page.length - 1];
  const next_cursor = hasMore && last ? encodeCursor(last.ts.toISOString(), last.id) : null;

  return {
    events: page.map((r) => ({
      id: r.id,
      ts: r.ts.toISOString(),
      stage_key: r.stage_key,
      type: r.type,
      payload: r.payload,
    })),
    next_cursor,
  };
}

function encodeCursor(ts: string, id: string) { return Buffer.from(`${ts}|${id}`).toString('base64url'); }
function decodeCursor(c?: string): [string | null, string | null] {
  if (!c) return [null, null];
  const [ts, id] = Buffer.from(c, 'base64url').toString('utf8').split('|');
  return [ts ?? null, id ?? null];
}
