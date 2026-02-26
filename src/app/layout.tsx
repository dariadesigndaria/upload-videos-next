import type { Metadata } from 'next';
import { Figtree, Poppins, Red_Hat_Display } from 'next/font/google';

import './globals.css';
import Providers from './providers';

const figtree = Figtree({ subsets: ['latin'], variable: '--font-figtree' });
const poppins = Poppins({
  subsets: ['latin'],
  weight: ['500'],
  variable: '--font-poppins',
});
const redHatDisplay = Red_Hat_Display({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600'],
  variable: '--font-red-hat-display',
});

export const metadata: Metadata = {
  title: 'Upload Videos',
  description: 'Figma implementation with Yachtway design system',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${figtree.variable} ${poppins.variable} ${redHatDisplay.variable}`}
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
