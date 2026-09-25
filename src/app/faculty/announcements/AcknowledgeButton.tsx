'use client';

import { Check } from 'lucide-react';
import { Badge, Button } from '@/components/ui';
import { formatDate } from '@/lib/utils';
import { useMutation } from '../_components/useMutation';
import { MutationError } from '../_components/MutationError';

/**
 * Acknowledgement is a legal-ish record: it says this person confirmed they
 * read the notice. It is only shown as done once the server confirms it.
 */
export function AcknowledgeButton({
  announcementId,
  acknowledgedAt,
}: {
  announcementId: string;
  acknowledgedAt: string | null;
}) {
  const mutation = useMutation();

  if (acknowledgedAt || mutation.succeeded) {
    return (
      <Badge tone="success" icon={Check}>
        {acknowledgedAt ? `acknowledged ${formatDate(acknowledgedAt, false)}` : 'acknowledged'}
      </Badge>
    );
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <Button
        size="sm"
        variant="primary"
        icon={Check}
        loading={mutation.pending}
        onClick={() =>
          mutation.run(`/api/announcements/${announcementId}/acknowledge`, { body: {} })
        }
      >
        I have read this
      </Button>
      {mutation.error ? (
        <div className="w-full max-w-sm">
          <MutationError error={mutation.error} title="Not acknowledged" />
        </div>
      ) : null}
    </div>
  );
}
