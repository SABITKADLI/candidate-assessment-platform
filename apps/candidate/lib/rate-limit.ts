import { Redis } from 'ioredis';

// Singleton Redis connection — same pattern as queues.ts.
declare global {
  // eslint-disable-next-line no-var
  var __cap_rl_redis: Redis | null | undefined;
}

function getRlRedis(): Redis | null {
  if (globalThis.__cap_rl_redis !== undefined) return globalThis.__cap_rl_redis;
  const url = process.env.REDIS_URL;
  if (!url) { globalThis.__cap_rl_redis = null; return null; }
  globalThis.__cap_rl_redis = new Redis(url, {
    maxRetriesPerRequest: 0,
    enableOfflineQueue: false,
    lazyConnect: true,
  });
  return globalThis.__cap_rl_redis;
}

// In-memory fallback for when Redis is unavailable.
const _mem = new Map<string, { n: number; reset: number }>();

function memCheck(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const entry = _mem.get(key);
  if (!entry || now >= entry.reset) {
    _mem.set(key, { n: 1, reset: now + windowMs });
    return true;
  }
  entry.n += 1;
  return entry.n <= limit;
}

/**
 * Returns a 429 Response if the caller is over the limit, null if allowed.
 * Soft-fails open on Redis errors — never blocks legitimate traffic due to infra issues.
 *
 * @param req     - Incoming request (standard Request or NextRequest)
 * @param slug    - Short identifier for this endpoint, e.g. 'stage_complete'
 * @param limit   - Max requests per window (default 30)
 * @param windowS - Window size in seconds (default 60)
 */
export async function rateLimit(
  req: Request,
  slug: string,
  limit = 30,
  windowS = 60,
): Promise<Response | null> {
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    '127.0.0.1';
  const key = `rl:${slug}:${ip}`;
  const redis = getRlRedis();

  if (redis) {
    try {
      const count = await redis.incr(key);
      if (count === 1) void redis.expire(key, windowS);
      if (count > limit) return tooMany(windowS);
      return null;
    } catch {
      // Redis unreachable — soft-fail open
    }
  }

  if (!memCheck(key, limit, windowS * 1000)) return tooMany(windowS);
  return null;
}

function tooMany(windowS: number): Response {
  return new Response(JSON.stringify({ error: 'rate_limited' }), {
    status: 429,
    headers: { 'Content-Type': 'application/json', 'Retry-After': String(windowS) },
  });
}
