'use client';

import { useReportClientError } from '@/components/ClientErrorReporter';
import * as React from 'react';
import Link from 'next/link';
import { RotateCw } from 'lucide-react';
import { Button, ErrorState } from '@/components/ui';

export default function FacultyError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useReportClientError(error);
  React.useEffect(() => {
    console.error('[campusos:faculty] page error', error);
  }, [error]);

  return (
    <div className="mx-auto max-w-xl py-6">
      <ErrorState
        title="This page could not be loaded"
        message={
          error.message ||
          'The server could not assemble this screen. No data was changed by the failed request.'
        }
        hint="Retrying is safe. If it keeps happening, quote the reference below to your administrator."
        reference={error.digest}
        action={
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" icon={RotateCw} onClick={reset}>
              Try again
            </Button>
            <Button asChild variant="secondary">
              <Link href="/faculty">Back to dashboard</Link>
            </Button>
          </div>
        }
      />
    </div>
  );
}
