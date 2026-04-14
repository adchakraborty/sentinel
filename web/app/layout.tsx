import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'SENTINEL — AI Security & QA Dashboard',
  description: 'AI-powered autonomous security testing, accessibility auditing, and QA. Give it a URL, get a full report.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;900&family=JetBrains+Mono:wght@400;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen antialiased">
        {children}
      </body>
    </html>
  );
}
