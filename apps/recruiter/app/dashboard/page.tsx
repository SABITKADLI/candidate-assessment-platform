import { auth0, auth0Configured } from '@/lib/auth0';
import { sql } from '@cap/db';

export const dynamic = 'force-dynamic';

export default async function Dashboard() {
  if (!auth0Configured) {
    return (
      <main style={{ fontFamily: 'system-ui', padding: 48 }}>
        <h1>Dashboard</h1>
        <p>Auth0 not configured — see the home page for setup.</p>
      </main>
    );
  }
  if (!process.env.DATABASE_URL) {
    return (
      <main style={{ fontFamily: 'system-ui', padding: 48 }}>
        <h1>Dashboard</h1>
        <p>DATABASE_URL not set in <code>apps/recruiter/.env.local</code>.</p>
      </main>
    );
  }
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
