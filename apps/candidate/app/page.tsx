import { Card } from '@cap/ui';

export default function Home() {
  return (
    <main style={{
      minHeight: '100dvh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 'var(--cap-space-6)',
    }}>
      <Card style={{ padding: 'var(--cap-space-8)', maxWidth: 520, textAlign: 'center' }}>
        <div style={{
          fontFamily: 'var(--cap-font-mono)',
          fontSize: 11, letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: 'var(--cap-accent)',
          marginBottom: 8,
        }}>CAP · Candidate Assessment</div>
        <h1 style={{
          margin: 0, fontSize: 22, fontWeight: 600, color: 'var(--cap-fg-1)',
        }}>Access via invitation link</h1>
        <p style={{
          marginTop: 12, marginBottom: 0,
          color: 'var(--cap-fg-2)', fontSize: 13, lineHeight: 1.6,
        }}>
          This site is invitation-only. Open the link in the email you received
          from your recruiter to begin your assessment.
        </p>
      </Card>
    </main>
  );
}
