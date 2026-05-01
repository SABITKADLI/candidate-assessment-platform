import { redirect } from 'next/navigation';
import { auth0, auth0Configured } from '@/lib/auth0';
import { Sidebar, Card } from '@cap/ui';
import { RoleForm } from '@/lib/RoleForm';
import { BackLink } from '@/lib/BackLink';

export const dynamic = 'force-dynamic';

export default async function NewRolePage() {
  if (auth0Configured) {
    const session = await auth0.getSession();
    if (!session) redirect('/');
  }

  return (
    <div style={{ display: 'flex', minHeight: '100dvh' }}>
      <Sidebar activeId="roles" />

      <main id="main-content" className="cap-main" style={{ flex: 1, padding: 'var(--cap-space-8)', minWidth: 0 }}>
        <div style={{ maxWidth: 680 }}>
          <header style={{ marginBottom: 'var(--cap-space-8)' }}>
            <BackLink href="/roles" label="Roles" />
            <h1 style={{ margin: '0 0 4px', fontSize: 'var(--cap-text-xl)', fontWeight: 600, letterSpacing: '-0.01em' }}>
              New role
            </h1>
            <p style={{ margin: 0, fontSize: 'var(--cap-text-base)', color: 'var(--cap-fg-2)' }}>
              Configure which assessments to include and how to weight them.
            </p>
          </header>

          <Card style={{ padding: 'var(--cap-space-6)' }}>
            <RoleForm />
          </Card>
        </div>
      </main>
    </div>
  );
}
