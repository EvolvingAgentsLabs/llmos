import type { Metadata } from 'next';
import '../styles/globals.css';
import { ThemeProvider } from '@/lib/theme-provider';

export const metadata: Metadata = {
  title: 'LLMos-Lite',
  description: 'An Evolving Operating System for AI-Native Development',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <ThemeProvider>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
