import { auth0 } from '@/lib/auth0';
import { sql } from '@cap/db';

export const dynamic = 'force-dynamic';

export default async function Dashboard() {
  const session = await auth0.getSession();
  const [counts] = await sql<{ sessions: string; open_flags: string }[]>`
    SELECT
      (SELECT count(*) FROM app.sessions)::text AS sessions,
      (SELECT count(*) FROM app.proctoring_flags WHERE resolved = false)::text AS open_flags
  `;
  return (
    <main style={{ fontFamily: 'system-ui', padding: 48 }}>
      <h1>Dashboard</h1>
      <p>Welcome, {session?.user.name ?? 'recruiter'}.</p>
      <ul>
        <li>Sessions: {counts!.sessions}</li>
        <li>Open flags: {counts!.open_flags}</li>
      </ul>
      <a href="/auth/logout">Sign out</a>
    </main>
  );
}
