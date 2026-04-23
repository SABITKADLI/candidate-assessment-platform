import { redirect } from 'next/navigation';
import { auth0, auth0Configured } from '@/lib/auth0';
import { Sidebar, Card } from '@cap/ui';
import { NewSessionForm } from '@/lib/NewSessionForm';

export const dynamic = 'force-dynamic';

export default async function NewSessionPage() {
  if (auth0Configured) {
    const session = await auth0.getSession();
    if (!session) redirect('/');
  }

  return (
    <div style={{ display: 'flex', minHeight: '100dvh' }}>
      <Sidebar activeId="sessions" />
      <main style={{ flex: 1, padding: 'var(--cap-space-8)', maxWidth: 640 }}>
        <header style={{ marginBottom: 'var(--cap-space-8)' }}>
          <a href="/dashboard" style={{ fontSize: 12, color: 'var(--cap-fg-3)', textDecoration: 'none' }}>
            ← Dashboard
          </a>
          <h1 style={{ margin: '8px 0 4px', fontSize: 22, fontWeight: 600 }}>New assessment session</h1>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--cap-fg-2)' }}>
            Create an invite link to send to a candidate.
          </p>
        </header>
        <Card style={{ padding: 'var(--cap-space-6)' }}>
          <NewSessionForm />
        </Card>
      </main>
    </div>
  );
}
