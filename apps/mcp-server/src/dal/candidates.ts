import { sql } from '@cap/db';
import type { SessionStatus, StageGroup } from '@cap/shared';

// ---------- Search ----------
export interface SearchFilter {
  role?: string;                 // role name (e.g. "backend_engineer")
  stage?: StageGroup;            // 'A' | 'B'
  status?: SessionStatus[];
  min_score?: number;
  max_score?: number;
  since?: string;                // ISO
  until?: string;                // ISO
  limit?: number;                // 1..100
  cursor?: string;               // opaque: base64("<iso_ts>|<uuid>")
  include_pii?: boolean;         // only honored by caller with scope
}

export interface SearchRow {
  session_id: string;
  candidate_id: string;
  email: string | null;          // null when redacted
  role: string | null;
  stage: StageGroup;
  status: SessionStatus;
  composite: number | null;
  open_flags: number;
  created_at: string;
}

export async function searchCandidates(f: SearchFilter): Promise<{ rows: SearchRow[]; next_cursor: string | null }> {
  const limit = Math.min(Math.max(f.limit ?? 25, 1), 100);
  const [cTs, cId] = decodeCursor(f.cursor);

  const rows = await sql<Array<{
    session_id: string; candidate_id: string; email: string | null;
    role: string | null; stage: StageGroup; status: SessionStatus;
    composite: string | null; open_flags: string; created_at: Date;
  }>>`
    SELECT
      s.id                AS session_id,
      c.id                AS candidate_id,
      ${f.include_pii ? sql`c.email` : sql`NULL::text`} AS email,
      r.name              AS role,
      s.stage, s.status,
      sc.composite        AS composite,
      (SELECT count(*) FROM app.proctoring_flags pf
        WHERE pf.session_id = s.id AND pf.resolved = false) AS open_flags,
      s.created_at
    FROM app.sessions s
      JOIN app.candidates c ON c.id = s.candidate_id
      LEFT JOIN app.roles  r ON r.id = s.role_id
      LEFT JOIN app.scores sc ON sc.session_id = s.id
    WHERE 1=1
      ${f.role   ? sql`AND r.name = ${f.role}` : sql``}
      ${f.stage  ? sql`AND s.stage = ${f.stage}::app.stage_group` : sql``}
      ${f.status && f.status.length
        ? sql`AND s.status = ANY(${f.status}::app.session_status[])` : sql``}
      ${f.min_score != null ? sql`AND sc.composite >= ${f.min_score}` : sql``}
      ${f.max_score != null ? sql`AND sc.composite <= ${f.max_score}` : sql``}
      ${f.since ? sql`AND s.created_at >= ${f.since}::timestamptz` : sql``}
      ${f.until ? sql`AND s.created_at <  ${f.until}::timestamptz` : sql``}
      ${cTs && cId
        ? sql`AND (s.created_at, s.id) < (${cTs}::timestamptz, ${cId}::uuid)` : sql``}
    ORDER BY s.created_at DESC, s.id DESC
    LIMIT ${limit + 1}
  `;

  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit);
  const last = page[page.length - 1];
  const next_cursor = hasMore && last ? encodeCursor(last.created_at.toISOString(), last.session_id) : null;

  return {
    rows: page.map((r) => ({
      session_id: r.session_id,
      candidate_id: r.candidate_id,
      email: r.email,
      role: r.role,
      stage: r.stage,
      status: r.status,
      composite: r.composite == null ? null : Number(r.composite),
      open_flags: Number(r.open_flags),
      created_at: r.created_at.toISOString(),
    })),
    next_cursor,
  };
}

// ---------- Single-session report ----------
export interface Report {
  session_id: string;
  candidate: { id: string; email: string | null; consent_version: string };
  role: { id: string; name: string } | null;
  stage: StageGroup;
  status: SessionStatus;
  score: { composite: number | null; per_stage: Record<string, number> | null;
           proctoring_mult: number | null; memo_url: string | null };
  stage_attempts: Array<{
    stage_key: string; attempt_no: number;
    score: number | null; duration_s: number | null; completed_at: string | null;
  }>;
  flags: Array<{
    id: string; severity: string; reason: string;
    details: unknown; resolved: boolean; created_at: string;
  }>;
  artifacts: Array<{ id: string; kind: string; size_bytes: number; created_at: string }>;
}

export async function getReport(sessionId: string, opts: { include_pii: boolean; presignMemo: (k: string) => Promise<string> }): Promise<Report | null> {
  const sessRows = await sql<Array<{
    id: string; stage: StageGroup; status: SessionStatus;
    candidate_id: string; email: string | null; consent_version: string;
    role_id: string | null; role_name: string | null;
    composite: string | null; per_stage: Record<string, number> | null;
    proctoring_mult: string | null; memo_s3_key: string | null;
  }>>`
    SELECT s.id, s.stage, s.status,
           c.id AS candidate_id, c.email, c.consent_version,
           r.id AS role_id, r.name AS role_name,
           sc.composite, sc.per_stage, sc.proctoring_mult, sc.memo_s3_key
    FROM app.sessions s
      JOIN app.candidates c ON c.id = s.candidate_id
      LEFT JOIN app.roles  r ON r.id = s.role_id
      LEFT JOIN app.scores sc ON sc.session_id = s.id
    WHERE s.id = ${sessionId}::uuid
    LIMIT 1
  `;
  const s = sessRows[0];
  if (!s) return null;

  const [attempts, flags, artifacts] = await Promise.all([
    sql<Array<{ stage_key: string; attempt_no: number; score: string | null;
                duration_s: number | null; completed_at: Date | null }>>`
      SELECT stage_key, attempt_no, score, duration_s, completed_at
      FROM app.stage_attempts
      WHERE session_id = ${sessionId}::uuid
      ORDER BY stage_key, attempt_no
    `,
    sql<Array<{ id: string; severity: string; reason: string; details: unknown;
                resolved: boolean; created_at: Date }>>`
      SELECT id, severity, reason, details, resolved, created_at
      FROM app.proctoring_flags
      WHERE session_id = ${sessionId}::uuid
      ORDER BY created_at DESC
    `,
    sql<Array<{ id: string; kind: string; size_bytes: string; created_at: Date }>>`
      SELECT id, kind, size_bytes, created_at
      FROM app.artifacts
      WHERE session_id = ${sessionId}::uuid
      ORDER BY created_at DESC
    `,
  ]);

  const memo_url = s.memo_s3_key ? await opts.presignMemo(s.memo_s3_key) : null;

  return {
    session_id: s.id,
    candidate: {
      id: s.candidate_id,
      email: opts.include_pii ? s.email : null,
      consent_version: s.consent_version,
    },
    role: s.role_id ? { id: s.role_id, name: s.role_name! } : null,
    stage: s.stage,
    status: s.status,
    score: {
      composite: s.composite == null ? null : Number(s.composite),
      per_stage: s.per_stage,
      proctoring_mult: s.proctoring_mult == null ? null : Number(s.proctoring_mult),
      memo_url,
    },
    stage_attempts: attempts.map((a) => ({
      stage_key: a.stage_key,
      attempt_no: a.attempt_no,
      score: a.score == null ? null : Number(a.score),
      duration_s: a.duration_s,
      completed_at: a.completed_at?.toISOString() ?? null,
    })),
    flags: flags.map((f) => ({ ...f, created_at: f.created_at.toISOString() })),
    artifacts: artifacts.map((a) => ({
      id: a.id, kind: a.kind,
      size_bytes: Number(a.size_bytes),
      created_at: a.created_at.toISOString(),
    })),
  };
}

// ---------- cursor helpers ----------
function encodeCursor(ts: string, id: string): string {
  return Buffer.from(`${ts}|${id}`, 'utf8').toString('base64url');
}
function decodeCursor(c?: string): [string | null, string | null] {
  if (!c) return [null, null];
  try {
    const [ts, id] = Buffer.from(c, 'base64url').toString('utf8').split('|');
    return [ts ?? null, id ?? null];
  } catch { return [null, null]; }
}
