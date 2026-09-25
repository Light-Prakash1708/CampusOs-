'use client';

import { CheckCheck } from 'lucide-react';
import { Button } from '@/components/ui';
import { pluralize } from '@/lib/utils';
import { useMutation } from '../_components/useMutation';
import { MutationError } from '../_components/MutationError';

export function MarkReadButton({ unreadCount }: { unreadCount: number }) {
  const mutation = useMutation<{ markedRead: number }>();

  if (unreadCount === 0) return null;

  return (
    <div className="flex flex-col items-end gap-2">
      <Button
        size="sm"
        variant="secondary"
        icon={CheckCheck}
        loading={mutation.pending}
        onClick={() => mutation.run('/api/faculty/notifications/read', { body: { scope: 'all' } })}
      >
        Mark {pluralize(unreadCount, 'notification')} read
      </Button>
      {mutation.error ? (
        <div className="w-full max-w-sm">
          <MutationError error={mutation.error} title="Nothing was marked read" />
        </div>
      ) : null}
    </div>
  );
}
