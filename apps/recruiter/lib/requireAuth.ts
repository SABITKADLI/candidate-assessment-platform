import { redirect } from 'next/navigation';
import { recruiterAccess } from './auth0';

export async function requireRecruiterSession() {
  const access = await recruiterAccess();
  if (access.status === 'misconfigured') {
    throw new Error('Auth0 configuration is incomplete or invalid');
  }
  if (access.status === 'unauthorized') redirect('/auth/login');
  return access.session;
}
