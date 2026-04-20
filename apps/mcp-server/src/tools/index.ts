import { z } from 'zod';
import {
  zStageKey, zStageGroup, zSessionStatus, zFlagSeverity,
} from '@cap/shared';
import type { Principal } from '../auth.js';
import { requireScope } from '../auth.js';
import { searchCandidates, getReport } from '../dal/candidates.js';
import { replay } from '../dal/telemetry.js';
import { createFlag, pushToAts } from '../dal/flags.js';
import { ToolError } from '../errors.js';

// Memo presigner is injected at server bootstrap so the MCP tier has no S3
// client surface itself. For local dev, returns the key as-is.
export type PresignMemo = (s3_key: string) => Promise<string>;

export interface ToolContext {
  principal: Principal;
  presignMemo: PresignMemo;
}

export interface ToolDef<I, O> {
  name: string;
  description: string;
  scopes: string[];        // ALL required
  input: z.ZodType<I>;
  output?: z.ZodType<O>;   // for doc only; runtime uses SDK typing
  handler: (ctx: ToolContext, input: I) => Promise<O>;
}

// ---------- search_candidates ----------
const SearchInput = z.object({
  role: z.string().min(1).optional(),
  stage: zStageGroup.optional(),
  status: z.array(zSessionStatus).max(6).optional(),
  min_score: z.number().min(0).max(100).optional(),
  max_score: z.number().min(0).max(100).optional(),
  since: z.string().datetime().optional(),
  until: z.string().datetime().optional(),
  limit: z.number().int().min(1).max(100).optional(),
  cursor: z.string().optional(),
});

export const searchTool: ToolDef<z.infer<typeof SearchInput>, unknown> = {
  name: 'search_candidates',
  description:
    'List candidate sessions with optional filters (role, stage, status, score range, time window). ' +
    'Returns a paginated list. Emails are redacted unless the caller has candidates:read.pii.',
  scopes: ['candidates:read'],
  input: SearchInput,
  async handler(ctx, input) {
    const includePii = ctx.principal.scopes.has('candidates:read.pii');
    return searchCandidates({ ...input, include_pii: includePii });
  },
};

// ---------- get_candidate_report ----------
const ReportInput = z.object({ session_id: z.string().uuid() });

export const reportTool: ToolDef<z.infer<typeof ReportInput>, unknown> = {
  name: 'get_candidate_report',
  description:
    'Return the full scored report for one session: per-stage scores, proctoring ' +
    'multiplier, attempts, flags, artifacts, and a presigned URL to the Claude-generated memo.',
  scopes: ['candidates:read'],
  input: ReportInput,
  async handler(ctx, { session_id }) {
    const includePii = ctx.principal.scopes.has('candidates:read.pii');
    const r = await getReport(session_id, { include_pii: includePii, presignMemo: ctx.presignMemo });
    if (!r) throw new ToolError('not_found', `session ${session_id} not found`, 404);
    return r;
  },
};

// ---------- replay_session ----------
const ReplayInput = z.object({
  session_id: z.string().uuid(),
  stage_key: zStageKey.optional(),
  since: z.string().datetime().optional(),
  until: z.string().datetime().optional(),
  types: z.array(z.string().min(1).max(64)).max(32).optional(),
  limit: z.number().int().min(1).max(1000).optional(),
  cursor: z.string().optional(),
});

export const replayTool: ToolDef<z.infer<typeof ReplayInput>, unknown> = {
  name: 'replay_session',
  description:
    'Stream the proctoring telemetry for a session in forensic order. Supports filtering by ' +
    'stage_key, event types, and time window; paginated via cursor.',
  scopes: ['candidates:read', 'sessions:replay'],
  input: ReplayInput,
  async handler(_ctx, input) { return replay(input); },
};

// ---------- flag_for_review ----------
const FlagInput = z.object({
  session_id: z.string().uuid(),
  severity: zFlagSeverity,
  reason: z.string().min(2).max(128),
  note: z.string().max(1024).optional(),
});

export const flagTool: ToolDef<z.infer<typeof FlagInput>, unknown> = {
  name: 'flag_for_review',
  description:
    'Attach a human-review flag to a session. Does not auto-disqualify; routes the session ' +
    'into the review queue. Audited with the caller identity.',
  scopes: ['flags:write'],
  input: FlagInput,
  async handler(ctx, input) {
    return createFlag({ ...input, actor: `mcp:${ctx.principal.sub}` });
  },
};

// ---------- push_to_ats ----------
const PushInput = z.object({
  session_id: z.string().uuid(),
  ats: z.enum(['greenhouse', 'lever', 'workday']),
  stage_id: z.string().max(64).optional(),
  note: z.string().max(1024).optional(),
});

export const pushTool: ToolDef<z.infer<typeof PushInput>, unknown> = {
  name: 'push_to_ats',
  description:
    'Enqueue a push of the candidate record to the specified ATS (Greenhouse/Lever/Workday). ' +
    'Returns the audit seq for the enqueue; a worker performs the HTTP call.',
  scopes: ['ats:push'],
  input: PushInput,
  async handler(ctx, input) {
    return pushToAts({ ...input, actor: `mcp:${ctx.principal.sub}` });
  },
};

// ---------- registry ----------
export const TOOLS: ToolDef<unknown, unknown>[] = [
  searchTool, reportTool, replayTool, flagTool, pushTool,
] as unknown as ToolDef<unknown, unknown>[];

export function assertScopes(p: Principal, t: ToolDef<unknown, unknown>) {
  for (const s of t.scopes) requireScope(p, s);
}
