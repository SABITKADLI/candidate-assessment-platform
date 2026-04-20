import { redirect } from 'next/navigation';
import { auth0 } from '@/lib/auth0';

export default async function Home() {
  const session = await auth0.getSession();
  if (session) redirect('/dashboard');
  return (
    <main style={{ fontFamily: 'system-ui', padding: 48 }}>
      <h1>Recruiter Console</h1>
      <a href="/auth/login">Sign in</a>
    </main>
  );
}
