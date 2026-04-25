import type { ReactNode } from 'react';
import '@cap/ui/tokens.css';
import { SkipLink } from '@cap/ui';

export const metadata = { title: 'CAP · Recruiter Console' };

const themeScript = `(function(){try{var t=localStorage.getItem('cap-theme');if(t==='light'||t==='dark'){document.documentElement.setAttribute('data-theme',t)}else if(window.matchMedia('(prefers-color-scheme: light)').matches){document.documentElement.setAttribute('data-theme','light')}}catch(e){}})()`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Blocks paint until theme is applied — eliminates flash of wrong theme */}
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <SkipLink />
        {children}
      </body>
    </html>
  );
}
