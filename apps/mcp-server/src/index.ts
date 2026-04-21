if (!process.env.AUTH0_ISSUER || !process.env.AUTH0_AUDIENCE || !process.env.DATABASE_URL) {
  console.warn('[mcp-server] AUTH0_ISSUER/AUDIENCE/DATABASE_URL unset — skipping dev boot');
  process.exit(0);
}

import express, { type Request, type Response } from 'express';
import pino from 'pino';
import pinoHttp from 'pino-http';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { randomUUID } from 'node:crypto';
import { authMiddleware } from './auth.js';
import { RateLimiter, TOOL_LIMITS } from './rate_limit.js';
import { TOOLS, assertScopes, type PresignMemo } from './tools/index.js';
import { ToolError, toToolResult } from './errors.js';
import { auditLog } from '@cap/db';

const log = pino({ level: process.env.LOG_LEVEL ?? 'info' });

// ---- injected deps (S3 presigner) ------------------------------------------
// Keep an S3-free MCP surface; a stub is fine for local dev.
const presignMemo: PresignMemo = async (key) => {
  if (process.env.S3_PRESIGN_URL) {
    // Delegate to the app-tier presign endpoint rather than owning creds here.
    const r = await fetch(`${process.env.S3_PRESIGN_URL}?key=${encodeURIComponent(key)}`);
    if (!r.ok) throw new Error(`presign failed: ${r.status}`);
    const { url } = await r.json() as { url: string };
    return url;
  }
  return `s3://${key}`;   // dev placeholder
};

// ---- MCP server --------------------------------------------------------------
function makeMcp(principalSub: string): { server: McpServer; transport: StreamableHTTPServerTransport } {
  const server = new McpServer(
    { name: 'cap-mcp', version: '0.1.0' },
    { capabilities: { tools: {} } },
  );

  for (const t of TOOLS) {
    server.tool(
      t.name,
      t.description,
      // zod schema -> MCP SDK reads .shape for JSON schema emission
      (t.input as { shape?: Record<string, unknown> }).shape ?? {},
      async (raw: unknown) => {
        const started = Date.now();
        try {
          // Principal is closed over per-session; fetch the Express-scoped one.
          const principal = CURRENT_PRINCIPAL.get(principalSub);
          if (!principal) throw new ToolError('unauthenticated', 'no principal', 401);
          assertScopes(principal, t);

          const rl = await rateLimiter.check(principal.sub, t.name, TOOL_LIMITS[t.name]!);
          if (!rl.allowed) {
            throw new ToolError('rate_limited',
              `retry in ${Math.ceil(rl.retryAfterMs / 1000)}s`, 429);
          }

          const parsed = t.input.safeParse(raw);
          if (!parsed.success) throw new ToolError('invalid_input', parsed.error.message, 400);

          const result = await t.handler({ principal, presignMemo }, parsed.data);
          log.info({ tool: t.name, sub: principal.sub, ms: Date.now() - started }, 'tool.ok');

          // Mutating tools already audit; also audit read-heavy ones.
          if (t.name === 'get_candidate_report' || t.name === 'replay_session') {
            await auditLog(`mcp:${principal.sub}`, `mcp.${t.name}`,
              (raw as { session_id?: string } | undefined)?.session_id
                ? `session:${(raw as { session_id: string }).session_id}` : null,
              { tool: t.name });
          }

          return { content: [{ type: 'text', text: JSON.stringify(result) }] };
        } catch (e) {
          const err = toToolResult(e);
          log.warn({ tool: t.name, err, ms: Date.now() - started }, 'tool.err');
          return { content: [{ type: 'text', text: JSON.stringify({ error: err }) }], isError: true };
        }
      },
    );
  }

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
    // Streamable HTTP supports resumability; plug a store in prod.
  });
  return { server, transport };
}

// ---- Express glue ------------------------------------------------------------
const app = express();
app.use(pinoHttp({ logger: log }));
app.use(express.json({ limit: '1mb' }));
app.get('/healthz', (_req, res) => res.json({ ok: true }));

const rateLimiter = new RateLimiter();

// Thread-local principal map so the MCP tool callback (which doesn't receive
// the Express req) can resolve the caller. Key is principal.sub; we enforce
// one in-flight MCP session per Authorization token, which is sufficient here.
const CURRENT_PRINCIPAL = new Map<string, import('./auth.js').Principal>();

app.use('/mcp', authMiddleware(), async (req: Request, res: Response) => {
  const principal = res.locals.principal!;
  CURRENT_PRINCIPAL.set(principal.sub, principal);
  try {
    const { server, transport } = makeMcp(principal.sub);
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } finally {
    CURRENT_PRINCIPAL.delete(principal.sub);
  }
});

const port = Number(process.env.PORT ?? 8787);
app.listen(port, () => log.info({ port }, 'mcp-server listening'));

// Graceful shutdown
for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, async () => {
    log.info({ sig }, 'shutting down');
    await rateLimiter.close().catch(() => {});
    process.exit(0);
  });
}
