import { redirect } from 'next/navigation';
import { auth0, auth0Configured } from '@/lib/auth0';

export default async function Home() {
  if (!auth0Configured) {
    return (
      <main style={{ fontFamily: 'system-ui', padding: 48 }}>
        <h1>Recruiter Console</h1>
        <p>Auth0 not configured. Set <code>AUTH0_DOMAIN</code>, <code>AUTH0_CLIENT_ID</code>,
        <code>AUTH0_CLIENT_SECRET</code>, <code>AUTH0_SECRET</code>, <code>APP_BASE_URL</code> in
        <code>apps/recruiter/.env.local</code>.</p>
      </main>
    );
  }
  const session = await auth0.getSession();
  if (session) redirect('/dashboard');
  return (
    <main style={{ fontFamily: 'system-ui', padding: 48 }}>
      <h1>Recruiter Console</h1>
      <a href="/auth/login">Sign in</a>
    </main>
  );
}
