import type { NextFunction, Request, Response } from 'express';
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';

// --- Auth model ---------------------------------------------------------------
// The recruiter Next.js app mints Auth0 access tokens; those same tokens
// authenticate to this MCP server. We verify via JWKS (RS256) and enforce
// scopes issued by Auth0 RBAC. Claude (recruiter-side) attaches the token
// via `Authorization: Bearer <jwt>` on the MCP HTTP transport.
//
// Scopes we recognize:
//   candidates:read         -- list + redacted reports
//   candidates:read.pii     -- unredacted email/resume
//   sessions:replay         -- telemetry replay (PII-adjacent)
//   flags:write             -- create review flags
//   ats:push                -- push_to_ats
//
// Anything else -> 403.

const ISSUER   = requireEnv('AUTH0_ISSUER');              // e.g. https://tenant.us.auth0.com/
const AUDIENCE = requireEnv('AUTH0_AUDIENCE');            // API identifier in Auth0
const JWKS = createRemoteJWKSet(new URL(`${ISSUER.replace(/\/$/, '')}/.well-known/jwks.json`));

export interface Principal {
  sub: string;
  scopes: Set<string>;
  raw: JWTPayload;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Locals { principal?: Principal }
  }
}

export async function verifyBearer(req: Request): Promise<Principal> {
  const h = req.headers.authorization ?? '';
  const m = /^Bearer\s+(.+)$/.exec(h);
  if (!m) throw new AuthError(401, 'missing_token');

  const { payload } = await jwtVerify(m[1]!, JWKS, {
    issuer: ISSUER,
    audience: AUDIENCE,
  });

  const scopeStr = (payload.scope as string | undefined) ?? '';
  const scopes = new Set(scopeStr.split(/\s+/).filter(Boolean));
  return { sub: String(payload.sub ?? ''), scopes, raw: payload };
}

export function authMiddleware() {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.locals.principal = await verifyBearer(req);
      next();
    } catch (e) {
      const code = e instanceof AuthError ? e.status : 401;
      const reason = e instanceof AuthError ? e.reason : 'invalid_token';
      // RFC 6750 3.1 — WWW-Authenticate with error code.
      res.setHeader('WWW-Authenticate', `Bearer error="${reason}"`);
      res.status(code).json({ error: reason });
    }
  };
}

export function requireScope(p: Principal, scope: string): void {
  if (!p.scopes.has(scope)) throw new AuthError(403, `missing_scope:${scope}`);
}

export class AuthError extends Error {
  constructor(public status: number, public reason: string) { super(reason); }
}

function requireEnv(k: string): string {
  const v = process.env[k];
  if (!v) throw new Error(`${k} not set`);
  return v;
}
