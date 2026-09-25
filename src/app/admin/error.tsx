'use client';

import { useEffect } from 'react';
import { RotateCcw } from 'lucide-react';
import { Button, ErrorState, PageHeader } from '@/components/ui';

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[campusos:admin]', error);
  }, [error]);

  return (
    <div>
      <PageHeader title="Something did not load" />
      <ErrorState
        title="This page could not be loaded"
        message="The server hit an error while preparing this view. Your data has not been changed."
        hint="Try again. If it keeps happening, quote the reference below to your IT team."
        reference={error.digest}
        action={
          <Button variant="primary" icon={RotateCcw} onClick={reset}>
            Try again
          </Button>
        }
      />
    </div>
  );
}
