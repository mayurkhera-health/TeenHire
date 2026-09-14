import type { Metadata, Viewport } from 'next';
import { Figtree } from 'next/font/google';
import { AppProvider } from '@/lib/store';
import '@/styles/tokens.css';
import '@/styles/base.css';
import '@/styles/components.css';
import '@/styles/screens.css';
import '@/styles/welcome.css';

/* One family across the whole product. Bricolage, Jakarta and Space Mono
   were retired when the app migrated to the Screen 01 system — three families
   and a 10px mono badge could not survive its "nothing below 13px" floor. */

const figtree = Figtree({
  subsets: ['latin'],
  weight: ['400', '600', '800'],
  variable: '--font-figtree',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'TeenHire — what can I do near me?',
  description:
    'Paid jobs, internships and volunteering near you, for high-school students. No résumé needed.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#f4f8f6',
  /* Left zoomable on purpose: type has to reach 200% without clipping. */
  maximumScale: 5,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={figtree.variable}>
      <body>
        <AppProvider>{children}</AppProvider>
      </body>
    </html>
  );
}
