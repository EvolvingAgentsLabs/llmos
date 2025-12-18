import type { Metadata } from 'next';
import { JetBrains_Mono } from 'next/font/google';
import '../styles/globals.css';
import { ThemeProvider } from '@/lib/theme-provider';

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
});

export const metadata: Metadata = {
  title: 'LLMos-Lite Terminal',
  description: 'Git-aware terminal interface for LLMos-Lite',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className={jetbrainsMono.className}>
        <ThemeProvider>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
