import { redirect } from 'next/navigation';
import { auth0, auth0Configured } from '@/lib/auth0';
import { Button, Card } from '@cap/ui';

export default async function Home() {
  if (!auth0Configured) {
    return (
      <main style={{
        minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 'var(--cap-space-6)',
      }}>
        <Card style={{ padding: 'var(--cap-space-8)', maxWidth: 520 }}>
          <div style={{
            fontFamily: 'var(--cap-font-mono)',
            fontSize: 11, letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'var(--cap-accent)',
            marginBottom: 8,
          }}>CAP · Recruiter console</div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 600 }}>Auth not configured</h1>
          <p style={{
            marginTop: 12, color: 'var(--cap-fg-2)', fontSize: 13, lineHeight: 1.6,
          }}>
            Set <code style={{ fontFamily: 'var(--cap-font-mono)' }}>AUTH0_DOMAIN</code>,{' '}
            <code style={{ fontFamily: 'var(--cap-font-mono)' }}>AUTH0_CLIENT_ID</code>,{' '}
            <code style={{ fontFamily: 'var(--cap-font-mono)' }}>AUTH0_CLIENT_SECRET</code>,{' '}
            <code style={{ fontFamily: 'var(--cap-font-mono)' }}>AUTH0_SECRET</code>, and{' '}
            <code style={{ fontFamily: 'var(--cap-font-mono)' }}>APP_BASE_URL</code> in
            {' '}<code style={{ fontFamily: 'var(--cap-font-mono)' }}>apps/recruiter/.env.local</code>.
          </p>
        </Card>
      </main>
    );
  }
  const session = await auth0.getSession();
  if (session) redirect('/dashboard');
  return (
    <main style={{
      minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 'var(--cap-space-6)',
    }}>
      <Card style={{ padding: 'var(--cap-space-8)', maxWidth: 420, textAlign: 'center' }}>
        <div style={{
          fontFamily: 'var(--cap-font-mono)',
          fontSize: 11, letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: 'var(--cap-accent)',
          marginBottom: 8,
        }}>CAP · Recruiter console</div>
        <h1 style={{ margin: '0 0 16px', fontSize: 22, fontWeight: 600 }}>Sign in</h1>
        <a href="/auth/login" style={{ textDecoration: 'none' }}>
          <Button variant="primary" size="lg">Continue with SSO</Button>
        </a>
      </Card>
    </main>
  );
}
