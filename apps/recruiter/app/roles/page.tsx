import { requireRecruiterSession } from '@/lib/requireAuth';
import { sql } from '@cap/db';
import { Sidebar, Button, Card } from '@cap/ui';
import { Plus, Pencil } from 'lucide-react';
import { DeleteRoleButton } from '@/lib/DeleteRoleButton';

export const dynamic = 'force-dynamic';

type RoleRow = {
  id: string;
  name: string;
  description: string | null;
  stages_a: string[] | null;
  stages_b: string[] | null;
  created_at: Date;
};

const TH: React.CSSProperties = {
  padding: '10px 16px',
  textAlign: 'left',
  fontSize: 11,
  fontWeight: 500,
  color: 'var(--cap-fg-2)',
  textTransform: 'uppercase',
  letterSpacing: '0.07em',
  borderBottom: '1px solid var(--cap-border)',
  whiteSpace: 'nowrap',
  background: 'var(--cap-surface)',
};

export default async function RolesPage() {
  await requireRecruiterSession();

  const roles = await sql<RoleRow[]>`
    SELECT id, name, description, stages_a, stages_b, created_at
    FROM app.roles
    ORDER BY name ASC
  `.catch(() => [] as RoleRow[]);

  return (
    <div style={{ display: 'flex', minHeight: '100dvh' }}>
      <Sidebar activeId="roles" />

      <main id="main-content" className="cap-main" style={{ flex: 1, padding: 'var(--cap-space-8)', minWidth: 0 }}>
        <header style={{
          marginBottom: 'var(--cap-space-8)',
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 16,
        }}>
          <div>
            <h1 style={{
              margin: '0 0 4px',
              fontSize: 'var(--cap-text-xl)',
              fontWeight: 600,
              letterSpacing: '-0.02em',
              lineHeight: 1.25,
              color: 'var(--cap-fg-1)',
            }}>
              Roles
            </h1>
            <p style={{ margin: 0, fontSize: 'var(--cap-text-base)', color: 'var(--cap-fg-2)' }}>
              Define stage configurations and scoring weights per role.
            </p>
          </div>
          <a href="/roles/new" style={{ textDecoration: 'none', flexShrink: 0 }}>
            <Button variant="primary" size="lg">
              <Plus size={15} strokeWidth={2} aria-hidden />
              New role
            </Button>
          </a>
        </header>

        {roles.length === 0 ? (
          <Card>
            <div style={{
              padding: '64px 24px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 16,
              textAlign: 'center',
            }}>
              <svg width="56" height="56" viewBox="0 0 56 56" fill="none" aria-hidden>
                <rect width="56" height="56" rx="12" fill="var(--cap-surface-2)" />
                <rect x="14" y="20" width="10" height="2.5" rx="1.25" fill="var(--cap-border-2)" />
                <rect x="14" y="26" width="28" height="2.5" rx="1.25" fill="var(--cap-border)" />
                <rect x="14" y="32" width="22" height="2.5" rx="1.25" fill="var(--cap-border)" />
                <circle cx="42" cy="38" r="8" fill="var(--cap-accent)" />
                <path d="M39 38h6M42 35v6" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              <div>
                <p style={{ margin: '0 0 4px', fontSize: 14, fontWeight: 500, color: 'var(--cap-fg-1)' }}>
                  No roles yet
                </p>
                <p style={{ margin: 0, fontSize: 13, color: 'var(--cap-fg-3)', lineHeight: 1.6 }}>
                  Create a role to configure which assessments to include and how to weight them.
                </p>
              </div>
              <a href="/roles/new" style={{ textDecoration: 'none' }}>
                <Button variant="primary" size="sm">
                  <Plus size={14} strokeWidth={2} aria-hidden />
                  New role
                </Button>
              </a>
            </div>
          </Card>
        ) : (
          <Card style={{ overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr>
                    <th scope="col" style={TH}>Name</th>
                    <th scope="col" style={TH}>Stage A stages</th>
                    <th scope="col" style={TH}>Stage B stages</th>
                    <th scope="col" style={TH}>Created</th>
                    <th scope="col" style={{ ...TH, textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {roles.map((r) => (
                    <tr key={r.id} className="cap-table-row">
                      <td style={{ padding: '11px 16px', fontWeight: 500, maxWidth: 220 }}>
                        <div style={{ color: 'var(--cap-fg-1)' }}>{r.name}</div>
                        {r.description && (
                          <div style={{
                            fontSize: 11, color: 'var(--cap-fg-3)', marginTop: 2,
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 200,
                          }}>
                            {r.description}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '11px 16px', fontSize: 11, color: 'var(--cap-fg-3)', fontFamily: 'var(--cap-font-mono)' }}>
                        {r.stages_a ? `${r.stages_a.length} stages` : 'All (8)'}
                      </td>
                      <td style={{ padding: '11px 16px', fontSize: 11, color: 'var(--cap-fg-3)', fontFamily: 'var(--cap-font-mono)' }}>
                        {r.stages_b ? `${r.stages_b.length} stages` : 'All (5)'}
                      </td>
                      <td style={{ padding: '11px 16px', fontSize: 11, color: 'var(--cap-fg-3)', fontFamily: 'var(--cap-font-mono)', whiteSpace: 'nowrap' }}>
                        {r.created_at.toISOString().slice(0, 10)}
                      </td>
                      <td style={{ padding: '11px 16px', textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                          <a href={`/roles/${r.id}`} style={{ textDecoration: 'none' }}>
                            <Button variant="secondary" size="sm">
                              <Pencil size={12} strokeWidth={2} aria-hidden />
                              Edit
                            </Button>
                          </a>
                          <DeleteRoleButton roleId={r.id} roleName={r.name} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </main>
    </div>
  );
}
