'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Eye } from 'lucide-react';
import { Button, Field, Select, Textarea } from '@/components/ui';
import { ErrorBox, useApi } from '@/components/auth/useApi';

const REASONS: { value: string; label: string }[] = [
  { value: 'ID_UNCLEAR', label: 'ID unclear' },
  { value: 'ID_EXPIRED', label: 'ID expired' },
  { value: 'INFO_MISMATCH', label: 'Information mismatch' },
  { value: 'WRONG_INSTITUTION', label: 'Wrong institution' },
  { value: 'DUPLICATE', label: 'Duplicate request or account' },
  { value: 'NEEDS_MORE_INFO', label: 'Request more information' },
  { value: 'OTHER', label: 'Other' },
];

export function VerificationActions({ requestId, name, hasDocument, status }: { requestId: string; name: string; hasDocument: boolean; status: string }) {
  const router = useRouter();
  const api = useApi<{ status?: string; started?: boolean }>();
  const [rejecting, setRejecting] = React.useState(false);
  const [reason, setReason] = React.useState('ID_UNCLEAR');
  const [note, setNote] = React.useState('');

  async function act(body: Record<string, unknown>) {
    const d = await api.call(`/api/admin/verifications/${requestId}`, body);
    if (d) router.refresh();
    return d;
  }

  return (
    <div className="flex w-full flex-col gap-2 sm:w-auto sm:min-w-[260px]">
      <ErrorBox error={api.error} />
      {hasDocument ? (
        <Button
          asChild
          variant="secondary"
          size="sm"
          icon={Eye}
          onClick={() => {
            if (status === 'PENDING') void act({ action: 'START_REVIEW' });
          }}
        >
          <a href={`/api/admin/verifications/${requestId}/document`} target="_blank" rel="noreferrer noopener">
            View college ID
          </a>
        </Button>
      ) : null}
      {!rejecting ? (
        <div className="flex gap-2">
          <Button
            variant="primary"
            size="sm"
            className="flex-1"
            loading={api.loading}
            onClick={async () => {
              if (!window.confirm(`Approve ${name}? Their existing CampusOS account becomes a student account at your college.`)) return;
              await act({ action: 'APPROVE' });
            }}
          >
            Approve
          </Button>
          <Button variant="ghost" size="sm" className="flex-1" onClick={() => setRejecting(true)}>
            Decline…
          </Button>
        </div>
      ) : (
        <form
          className="space-y-2"
          onSubmit={async (e) => {
            e.preventDefault();
            await act({ action: 'REJECT', reason, note: note.trim() || null });
          }}
        >
          <Field label="Reason" htmlFor={`rsn-${requestId}`}>
            <Select id={`rsn-${requestId}`} value={reason} onChange={(e) => setReason(e.target.value)}>
              {REASONS.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </Select>
          </Field>
          <Field label="Note to the student (optional)" htmlFor={`note-${requestId}`} hint="Plain text, up to 300 characters.">
            <Textarea id={`note-${requestId}`} rows={2} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
          <div className="flex gap-2">
            <Button type="submit" variant="danger" size="sm" loading={api.loading}>Decline</Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setRejecting(false)}>Cancel</Button>
          </div>
        </form>
      )}
    </div>
  );
}
