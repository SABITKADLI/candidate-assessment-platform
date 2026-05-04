import { requireRecruiterSession } from '@/lib/requireAuth';
import { DiagnosticsPanel } from '@/lib/DiagnosticsPanel';
import { RescorePanel } from '@/lib/RescorePanel';
import { getAdminDiagnostics } from '@/lib/diagnostics';
import { Sidebar, Card } from '@cap/ui';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  await requireRecruiterSession();
  const diagnostics = await getAdminDiagnostics();
  const anthropicReady = Boolean(process.env.ANTHROPIC_API_KEY);

  return (
    <div style={{ display: 'flex', minHeight: '100dvh' }}>
      <Sidebar activeId="settings" />

      <main id="main-content" className="cap-main" style={{ flex: 1, padding: 'var(--cap-space-8)', minWidth: 0 }}>
        <div style={{ maxWidth: 1180, display: 'grid', gap: 'var(--cap-space-8)' }}>
          <header style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1fr) auto',
            gap: 'var(--cap-space-4)',
            alignItems: 'end',
          }}>
            <div>
              <h1 style={{ margin: '0 0 4px', fontSize: 'var(--cap-text-xl)', fontWeight: 600 }}>
                Settings
              </h1>
              <p style={{ margin: 0, fontSize: 'var(--cap-text-base)', color: 'var(--cap-fg-2)', maxWidth: 760 }}>
                Production diagnostics for admin, assessment, queues, workers, storage, and external APIs.
              </p>
            </div>
          </header>

          <DiagnosticsPanel initialSnapshot={diagnostics} />

          <section style={{ display: 'grid', gap: 'var(--cap-space-3)', maxWidth: 760 }}>
            <h2 style={{
              margin: 0,
              fontSize: 12,
              fontWeight: 600,
              color: 'var(--cap-fg-2)',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
            }}>
              Manual Rescore
            </h2>

            <Card style={{ overflow: 'hidden' }}>
              <div style={{
                padding: '12px 20px',
                borderBottom: '1px solid var(--cap-border)',
                background: 'var(--cap-surface-2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
              }}>
                <div>
                  <h3 style={{ margin: '0 0 2px', fontSize: 13, fontWeight: 600, color: 'var(--cap-fg-1)' }}>
                    Claude memo trigger
                  </h3>
                  <p style={{ margin: 0, fontSize: 11, color: 'var(--cap-fg-3)' }}>
                    Computes composite score and regenerates the recruiter memo for one session.
                  </p>
                </div>
                <span style={{
                  fontSize: 10,
                  fontWeight: 600,
                  fontFamily: 'var(--cap-font-mono)',
                  color: anthropicReady ? 'var(--cap-success)' : 'var(--cap-danger)',
                  background: anthropicReady ? 'var(--cap-success-muted)' : 'var(--cap-danger-muted)',
                  padding: '3px 8px',
                  borderRadius: 9999,
                  border: `1px solid ${anthropicReady ? 'var(--cap-success-border)' : 'var(--cap-danger-border)'}`,
                  flexShrink: 0,
                }}>
                  {anthropicReady ? 'API key set' : 'No API key'}
                </span>
              </div>
              <div style={{ padding: '16px 20px' }}>
                <RescorePanel />
              </div>
            </Card>
          </section>
        </div>
      </main>
    </div>
  );
}
