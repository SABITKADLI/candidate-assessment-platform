import { Redis } from 'ioredis';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  const url = process.env.REDIS_URL;
  if (!url) {
    return Response.json({
      ok: false,
      redis_url_present: false,
      error: 'REDIS_URL is not set',
    }, { status: 503 });
  }

  const redis = new Redis(url, {
    lazyConnect: true,
    maxRetriesPerRequest: 0,
    enableOfflineQueue: false,
    connectTimeout: 5_000,
  });
  redis.on('error', () => undefined);

  try {
    await redis.connect();
    const pong = await redis.ping();
    return Response.json({
      ok: pong === 'PONG',
      redis_url_present: true,
      redis_ping: pong,
    });
  } catch (err) {
    return Response.json({
      ok: false,
      redis_url_present: true,
      error: publicRedisError(err),
    }, { status: 503 });
  } finally {
    redis.disconnect();
  }
}

function publicRedisError(err: unknown): string {
  if (err instanceof Error) {
    return err.message
      .replace(/redis:\/\/[^@\s]+@/gi, 'redis://***@')
      .replace(/rediss:\/\/[^@\s]+@/gi, 'rediss://***@')
      .slice(0, 240);
  }
  return String(err).slice(0, 240);
}
