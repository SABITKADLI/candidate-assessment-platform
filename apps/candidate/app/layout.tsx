import type { ReactNode } from 'react';

export const metadata = {
  title: 'Assessment',
  // Avoid leaking info to link previewers/scrapers.
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
