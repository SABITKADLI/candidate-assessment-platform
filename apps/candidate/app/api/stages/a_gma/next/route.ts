import { cookies } from 'next/headers';
import { z } from 'zod';
import { nextStep } from '@/lib/gma';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const zBody = z.object({
  answer: z.object({
    item_id: z.string().uuid(),
    shuffled_choice: z.number().int().min(0).max(9),
    t_client_ms: z.number().int().min(0).max(15 * 60 * 1000),
  }).optional(),
});

export async function POST(req: Request) {
  const jar = await cookies();
  const sessionId = jar.get('cap_sess')?.value;
  if (!sessionId) return json({ error: 'no_session' }, 401);

  let body: unknown;
  try { body = await req.json(); } catch { return json({ error: 'bad_json' }, 400); }
  const parsed = zBody.safeParse(body);
  if (!parsed.success) return json({ error: 'bad_shape', detail: parsed.error.message }, 400);

  try {
    const result = await nextStep({ sessionId, answer: parsed.data.answer });
    return Response.json(result);
  } catch (e) {
    return json({ error: 'internal', detail: String(e).slice(0, 256) }, 500);
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status, headers: { 'Content-Type': 'application/json' },
  });
}
