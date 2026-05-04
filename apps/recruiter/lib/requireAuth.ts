import { redirect } from 'next/navigation';
import { auth0, auth0Configured } from './auth0';

export async function requireRecruiterSession() {
  if (!auth0Configured) redirect('/');

  const session = await auth0.getSession();
  if (!session) redirect('/auth/login');

  return session;
}
