import { redirect } from 'next/navigation';
import { auth0, auth0Configured } from '@/lib/auth0';
import { Sidebar, Card } from '@cap/ui';
import { NewSessionForm } from '@/lib/NewSessionForm';
import { ArrowLeft } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function NewSessionPage() {
  if (auth0Configured) {
    const session = await auth0.getSession();
    if (!session) redirect('/');
  }

  return (
    <div style={{ display: 'flex', minHeight: '100dvh' }}>
      <Sidebar activeId="sessions" />

      <main id="main-content" style={{ flex: 1, padding: 'var(--cap-space-8)', minWidth: 0 }}>
        <div style={{ maxWidth: 560 }}>
          <header style={{ marginBottom: 'var(--cap-space-8)' }}>
            <a
              href="/dashboard"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                fontSize: 12, color: 'var(--cap-fg-3)', textDecoration: 'none',
                marginBottom: 16,
                transition: 'color var(--cap-transition)',
              }}
              onMouseOver={(e) => { (e.currentTarget as HTMLAnchorElement).style.color = 'var(--cap-fg-1)'; }}
              onMouseOut={(e) => { (e.currentTarget as HTMLAnchorElement).style.color = 'var(--cap-fg-3)'; }}
            >
              <ArrowLeft size={13} strokeWidth={2} aria-hidden />
              Dashboard
            </a>
            <h1 style={{ margin: '0 0 4px', fontSize: 'var(--cap-text-xl)', fontWeight: 600, letterSpacing: '-0.01em' }}>
              New assessment session
            </h1>
            <p style={{ margin: 0, fontSize: 'var(--cap-text-base)', color: 'var(--cap-fg-2)' }}>
              Generate an invitation link to send to a candidate.
            </p>
          </header>

          <Card style={{ padding: 'var(--cap-space-6)' }}>
            <NewSessionForm />
          </Card>
        </div>
      </main>
    </div>
  );
}
