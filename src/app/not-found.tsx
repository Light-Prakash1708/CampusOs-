import Link from 'next/link';
import { FileQuestion } from 'lucide-react';
import { Button } from '@/components/ui';

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-muted px-6">
      <div className="w-full max-w-md rounded-xl border border-[hsl(var(--border))] bg-surface p-7 text-center shadow-xs">
        <span className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-surface-sunken">
          <FileQuestion size={20} className="text-subtle" />
        </span>
        <h1 className="text-[17px] font-semibold text-default">This page does not exist</h1>
        <p className="mt-2 text-[13.5px] leading-relaxed text-muted">
          The link may be out of date, or the record may have been removed.
        </p>
        <Button asChild variant="primary" className="mt-6">
          <Link href="/">Go to the start</Link>
        </Button>
      </div>
    </div>
  );
}
