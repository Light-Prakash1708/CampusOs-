'use client';

import Link from 'next/link';
import { useReportClientError } from '@/components/ClientErrorReporter';

/** Root error boundary: anything outside a portal-specific boundary lands here. */
export default function RootError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useReportClientError(error);
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center px-6 text-center">
      <h1 className="font-display text-[26px] font-extrabold text-default">Something went wrong</h1>
      <p className="mt-2 text-[14px] text-muted">The page hit an unexpected error. Your data is safe. Try again, or go back home.</p>
      {error.digest ? <p className="mt-2 font-mono text-[12px] text-subtle">Reference: {error.digest}</p> : null}
      <div className="mt-5 flex gap-2">
        <button onClick={reset} className="inline-flex min-h-[44px] items-center rounded-xl border-[1.5px] border-ink bg-brand px-4 text-[14px] font-bold text-white shadow-pop campus-press">
          Try again
        </button>
        <Link href="/" className="inline-flex min-h-[44px] items-center rounded-xl border-[1.5px] border-ink bg-surface px-4 text-[14px] font-bold text-default shadow-pop campus-press">
          Home
        </Link>
      </div>
    </main>
  );
}
