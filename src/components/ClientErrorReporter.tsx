'use client';

import * as React from 'react';

/** Sends one scrubbed crash report per error boundary render (best effort). */
export function useReportClientError(error: Error & { digest?: string }) {
  React.useEffect(() => {
    try {
      void fetch('/api/client-errors', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message: (error.message || 'Unknown error').slice(0, 500), digest: error.digest, route: window.location.pathname }),
        keepalive: true,
      }).catch(() => undefined);
    } catch {
      /* reporting is best effort */
    }
  }, [error]);
}
