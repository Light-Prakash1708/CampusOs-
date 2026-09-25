'use client';

import { AlertTriangle } from 'lucide-react';
import { ErrorState } from '@/components/ui';
import type { ApiError } from './useMutation';

/** Renders the real server error, never a generic "something went wrong". */
export function MutationError({ error, title }: { error: ApiError | null; title?: string }) {
  if (!error) return null;
  return (
    <ErrorState
      title={title ?? 'That did not save'}
      message={error.message}
      hint={
        error.hint ??
        (error.details?.length
          ? error.details.map((d) => `${d.field}: ${d.message}`).join(' · ')
          : undefined)
      }
      reference={error.requestId}
    />
  );
}

export function InlineWarning({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-start gap-1.5 text-[12.5px] text-warning">
      <AlertTriangle size={13} className="mt-0.5 shrink-0" aria-hidden />
      <span>{children}</span>
    </p>
  );
}
