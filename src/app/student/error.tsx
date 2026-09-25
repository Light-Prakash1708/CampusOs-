'use client';

import { useReportClientError } from '@/components/ClientErrorReporter';
import * as React from 'react';
import Link from 'next/link';
import { RotateCw } from 'lucide-react';
import { Button, ErrorState } from '@/components/ui';

/**
 * Route-level error boundary for the student portal.
 * It shows the real failure and a way forward — never a bare "went wrong".
 */
export default function StudentError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useReportClientError(error);
  React.useEffect(() => {
    console.error('[campusos:student]', error);
  }, [error]);

  return (
    <div className="mx-auto max-w-xl py-6">
      <ErrorState
        title="This page could not be loaded"
        message={error.message || 'The server did not return the data this page needs.'}
        hint="Retrying usually resolves a temporary database or network problem. If it keeps failing, report it through the Redressal Centre and quote the reference below."
        reference={error.digest}
        action={
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" icon={RotateCw} onClick={reset}>
              Try again
            </Button>
            <Button asChild variant="secondary">
              <Link href="/student">Back to dashboard</Link>
            </Button>
            <Button asChild variant="ghost">
              <Link href="/student/redressal/new?category=it-support">Report a problem</Link>
            </Button>
          </div>
        }
      />
    </div>
  );
}
