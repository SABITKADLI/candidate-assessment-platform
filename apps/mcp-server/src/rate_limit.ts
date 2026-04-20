import Redis from 'ioredis';

// Sliding-window rate limiter keyed by (principal_sub, tool_name).
// Uses a sorted set of request timestamps per key; TTL == window.
// Script is atomic and cheap (O(log n) trim + O(1) count).

const LUA = `
local key = KEYS[1]
local now = tonumber(ARGV[1])
local window_ms = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])
redis.call('ZREMRANGEBYSCORE', key, 0, now - window_ms)
local n = tonumber(redis.call('ZCARD', key))
if n >= limit then
  local oldest = tonumber(redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')[2])
  return {0, limit - n, oldest + window_ms - now}
end
redis.call('ZADD', key, now, now .. ':' .. math.random())
redis.call('PEXPIRE', key, window_ms)
return {1, limit - n - 1, 0}
`;

export interface RateLimitConfig { limit: number; windowMs: number }

export class RateLimiter {
  private redis: Redis;
  constructor(url = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379') {
    this.redis = new Redis(url, { lazyConnect: false, maxRetriesPerRequest: 2 });
  }

  async check(principalSub: string, tool: string, cfg: RateLimitConfig) {
    const key = `rl:${principalSub}:${tool}`;
    const res = await this.redis.eval(
      LUA, 1, key, Date.now().toString(), cfg.windowMs.toString(), cfg.limit.toString(),
    ) as [number, number, number];
    return { allowed: res[0] === 1, remaining: res[1], retryAfterMs: res[2] };
  }

  async close() { await this.redis.quit(); }
}

// Per-tool defaults; expensive ops get stricter caps.
export const TOOL_LIMITS: Record<string, RateLimitConfig> = {
  search_candidates:   { limit: 60,  windowMs: 60_000 },
  get_candidate_report:{ limit: 30,  windowMs: 60_000 },
  replay_session:      { limit: 10,  windowMs: 60_000 },
  flag_for_review:     { limit: 30,  windowMs: 60_000 },
  push_to_ats:         { limit: 10,  windowMs: 60_000 },
};
