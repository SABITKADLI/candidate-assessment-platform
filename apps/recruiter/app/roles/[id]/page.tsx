import { redirect, notFound } from 'next/navigation';
import { auth0, auth0Configured } from '@/lib/auth0';
import { sql } from '@cap/db';
import { Sidebar, Card } from '@cap/ui';
import { RoleForm } from '@/lib/RoleForm';
import { BackLink } from '@/lib/BackLink';

export const dynamic = 'force-dynamic';

type RoleRow = {
  id: string;
  name: string;
  description: string | null;
  stages_a: string[] | null;
  stages_b: string[] | null;
  stage_weights: Record<string, number> | null;
};

export default async function EditRolePage({ params }: { params: Promise<{ id: string }> }) {
  if (auth0Configured) {
    const session = await auth0.getSession();
    if (!session) redirect('/');
  }

  const { id } = await params;

  const [role] = await sql<RoleRow[]>`
    SELECT id, name, description, stages_a, stages_b, stage_weights
    FROM app.roles WHERE id = ${id}::uuid
  `.catch(() => [] as RoleRow[]);

  if (!role) notFound();

  return (
    <div style={{ display: 'flex', minHeight: '100dvh' }}>
      <Sidebar activeId="roles" />

      <main id="main-content" className="cap-main" style={{ flex: 1, padding: 'var(--cap-space-8)', minWidth: 0 }}>
        <div style={{ maxWidth: 680 }}>
          <header style={{ marginBottom: 'var(--cap-space-8)' }}>
            <BackLink href="/roles" label="Roles" />
            <h1 style={{ margin: '0 0 4px', fontSize: 'var(--cap-text-xl)', fontWeight: 600, letterSpacing: '-0.01em' }}>
              Edit role
            </h1>
            <p style={{ margin: 0, fontSize: 'var(--cap-text-base)', color: 'var(--cap-fg-2)' }}>
              {role.name}
            </p>
          </header>

          <Card style={{ padding: 'var(--cap-space-6)' }}>
            <RoleForm initial={{
              ...role,
              description: role.description ?? undefined,
            }} />
          </Card>
        </div>
      </main>
    </div>
  );
}
