import type { ReactNode } from 'react';
import '@cap/ui/tokens.css';

export const metadata = { title: 'Recruiter Console' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
