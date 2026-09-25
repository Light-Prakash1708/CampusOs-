'use client';

import { Lock, RotateCcw, Send } from 'lucide-react';
import { Button } from '@/components/ui';
import { useMutation } from '../../_components/useMutation';
import { MutationError } from '../../_components/MutationError';

/** Publish / close / reopen. Every button here maps to a real transition. */
export function AssignmentActions({ id, status }: { id: string; status: string }) {
  const mutation = useMutation<{ action: string; studentsAdded: number }>();

  const action =
    status === 'DRAFT'
      ? { key: 'publish', label: 'Publish to students', icon: Send, variant: 'primary' as const }
      : status === 'PUBLISHED'
        ? { key: 'close', label: 'Close submissions', icon: Lock, variant: 'secondary' as const }
        : status === 'CLOSED'
          ? { key: 'reopen', label: 'Reopen', icon: RotateCcw, variant: 'secondary' as const }
          : null;

  return (
    <div className="flex flex-col items-end gap-2">
      {action ? (
        <Button
          variant={action.variant}
          icon={action.icon}
          loading={mutation.pending}
          onClick={() =>
            mutation.run(`/api/faculty/assignments/${id}`, {
              method: 'PATCH',
              body: { action: action.key },
            })
          }
        >
          {action.label}
        </Button>
      ) : null}
      {mutation.error ? (
        <div className="w-full max-w-sm">
          <MutationError error={mutation.error} title="That change was not applied" />
        </div>
      ) : null}
    </div>
  );
}
