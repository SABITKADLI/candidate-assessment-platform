import { requireRecruiterSession } from '@/lib/requireAuth';
import { Sidebar, Card } from '@cap/ui';
import { NewSessionForm } from '@/lib/NewSessionForm';
import { BackLink } from '@/lib/BackLink';

export const dynamic = 'force-dynamic';

export default async function NewSessionPage() {
  await requireRecruiterSession();

  return (
    <div style={{ display: 'flex', minHeight: '100dvh' }}>
      <Sidebar activeId="sessions" />

      <main id="main-content" className="cap-main" style={{ flex: 1, padding: 'var(--cap-space-8)', minWidth: 0 }}>
        <div style={{ maxWidth: 560 }}>
          <header style={{ marginBottom: 'var(--cap-space-8)' }}>
            <BackLink href="/dashboard" label="Dashboard" />
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
