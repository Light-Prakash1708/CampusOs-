'use client';

import { useReportClientError } from '@/components/ClientErrorReporter';

/**
 * Last-resort boundary for errors in the root layout itself. It replaces the
 * whole document, so it cannot rely on app CSS — minimal inline styles only.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useReportClientError(error);
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: 'system-ui, sans-serif', background: '#FBF7EF', color: '#1F1B3D' }}>
        <main style={{ maxWidth: 480, margin: '15vh auto', padding: 24, textAlign: 'center' }}>
          <h1 style={{ fontSize: 24 }}>CampusOS couldn’t load</h1>
          <p>An unexpected error stopped the app. Your data is safe.</p>
          {error.digest ? <p style={{ fontFamily: 'monospace', fontSize: 12, opacity: 0.7 }}>Reference: {error.digest}</p> : null}
          <button onClick={reset} style={{ minHeight: 44, padding: '0 18px', borderRadius: 12, border: '1.5px solid #1F1B3D', background: '#4F46E5', color: '#fff', fontWeight: 700 }}>
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
