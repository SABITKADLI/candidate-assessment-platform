import { sql } from '@cap/db';
import { recruiterAccess } from './auth0';

export interface ReviewerIdentity {
  id: string;
  actor: string;
  email: string | null;
  name: string | null;
}

export async function requireReviewer(): Promise<ReviewerIdentity> {
  const access = await recruiterAccess();
  if (access.status !== 'authenticated') throw new Error('Unauthorized');
  const user = access.session.user as { sub?: string; email?: string; name?: string };
  const sub = user.sub;
  if (!sub) throw new Error('Auth0 subject missing');
  return upsertUser(sub, user.email ?? null, user.name ?? null);
}

async function upsertUser(auth0Sub: string, email: string | null, name: string | null): Promise<ReviewerIdentity> {
  const [row] = await sql<Array<{ id: string; email: string | null; name: string | null }>>`
    INSERT INTO app.users (auth0_sub, email, name)
    VALUES (${auth0Sub}, ${email}, ${name})
    ON CONFLICT (auth0_sub) DO UPDATE
      SET email = EXCLUDED.email,
          name = EXCLUDED.name,
          updated_at = now()
    RETURNING id, email, name
  `;
  return {
    id: row!.id,
    actor: `recruiter:${auth0Sub}`,
    email: row!.email,
    name: row!.name,
  };
}
