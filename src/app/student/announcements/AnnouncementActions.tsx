'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Check, CheckCheck } from 'lucide-react';
import { Button, ErrorState } from '@/components/ui';
import { formatDateTime } from '@/lib/utils';

/**
 * Read + acknowledgement controls for a single notice.
 *
 * Acknowledgement posts to the shared announcement route; "mark as read" posts
 * to the student-portal route. Both surface the API's real error message and
 * hint rather than a generic failure.
 */
export function AnnouncementActions({
  announcementId,
  requiresAcknowledgement,
  acknowledgedAt,
  readAt,
}: {
  announcementId: string;
  requiresAcknowledgement: boolean;
  acknowledgedAt: string | null;
  readAt: string | null;
}) {
  const router = useRouter();
  const [pending, setPending] = React.useState<null | 'read' | 'ack'>(null);
  const [error, setError] = React.useState<{ message: string; hint?: string } | null>(null);

  async function post(url: string, kind: 'read' | 'ack') {
    setPending(kind);
    setError(null);
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ announcementId }),
      });
      const payload = (await response.json().catch(() => null)) as
        | { ok: boolean; error?: { message?: string; hint?: string } }
        | null;

      if (!response.ok || !payload?.ok) {
        setError({
          message:
            payload?.error?.message ??
            `The server rejected this request (HTTP ${response.status}).`,
          hint: payload?.error?.hint,
        });
        return;
      }
      router.refresh();
    } catch {
      setError({
        message: 'Could not reach the server.',
        hint: 'Check your connection and try again — nothing was recorded.',
      });
    } finally {
      setPending(null);
    }
  }

  if (acknowledgedAt) {
    return (
      <p className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-success">
        <CheckCheck size={14} aria-hidden />
        Acknowledged {formatDateTime(acknowledgedAt)}
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {requiresAcknowledgement ? (
          <Button
            variant="primary"
            size="sm"
            icon={Check}
            loading={pending === 'ack'}
            disabled={pending !== null}
            onClick={() => post(`/api/announcements/${announcementId}/acknowledge`, 'ack')}
          >
            I&rsquo;ve read this
          </Button>
        ) : null}

        {!readAt ? (
          <Button
            variant="ghost"
            size="sm"
            loading={pending === 'read'}
            disabled={pending !== null}
            onClick={() => post('/api/student/announcements/read', 'read')}
          >
            Mark as read
          </Button>
        ) : (
          <span className="text-[12px] text-subtle">Read {formatDateTime(readAt)}</span>
        )}
      </div>

      {error ? (
        <ErrorState
          title="That did not go through"
          message={error.message}
          hint={error.hint ?? 'Nothing was recorded. You can safely try again.'}
        />
      ) : null}
    </div>
  );
}
