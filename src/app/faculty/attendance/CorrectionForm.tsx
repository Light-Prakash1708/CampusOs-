'use client';

import * as React from 'react';
import { History, ShieldCheck } from 'lucide-react';
import { Alert, Badge, Button, Field, Select, Textarea } from '@/components/ui';
import { humanize } from '@/lib/utils';
import { useMutation } from '../_components/useMutation';
import { MutationError } from '../_components/MutationError';

const STATUSES = ['PRESENT', 'ABSENT', 'LATE', 'EXCUSED', 'MEDICAL'] as const;

/**
 * Correcting a submitted register. The reason is mandatory (server-enforced),
 * the original value is preserved on the record, and an audit entry is written.
 */
export function CorrectionForm({
  recordId,
  studentName,
  currentStatus,
  originalStatus,
  correctionReason,
}: {
  recordId: string;
  studentName: string;
  currentStatus: string;
  originalStatus: string | null;
  correctionReason: string | null;
}) {
  const [open, setOpen] = React.useState(false);
  const [status, setStatus] = React.useState(currentStatus);
  const [reason, setReason] = React.useState('');
  const mutation = useMutation<{ from: string; to: string }>();

  const alreadyCorrected = originalStatus !== null;

  if (!open) {
    return (
      <div className="flex items-center gap-2">
        {alreadyCorrected ? (
          <span title={correctionReason ?? undefined}>
            <Badge tone="info" icon={History}>
              corrected from {humanize(originalStatus)}
            </Badge>
          </span>
        ) : null}
        <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
          Correct
        </Button>
      </div>
    );
  }

  return (
    <div className="w-full rounded-lg border border-[hsl(var(--border-strong))] bg-surface-muted p-3">
      {mutation.succeeded && mutation.data ? (
        <Alert tone="success" icon={ShieldCheck} title="Correction recorded">
          {studentName}: {humanize(mutation.data.from)} → {humanize(mutation.data.to)}. The original
          value and your reason are stored on the record and in the audit log.
        </Alert>
      ) : (
        <>
          <p className="mb-2 text-[13px] font-medium text-default">
            Correct {studentName} (currently {humanize(currentStatus)})
          </p>
          <div className="grid gap-2.5 sm:grid-cols-[160px_minmax(0,1fr)]">
            <Field label="New status" htmlFor={`status-${recordId}`}>
              <Select
                id={`status-${recordId}`}
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {humanize(s)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field
              label="Reason"
              htmlFor={`reason-${recordId}`}
              required
              hint="Recorded permanently against this record. At least 10 characters."
            >
              <Textarea
                id={`reason-${recordId}`}
                rows={2}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Student produced a medical certificate dated the same day."
              />
            </Field>
          </div>
          <div className="mt-2.5">
            <MutationError error={mutation.error} title="The correction was not saved" />
          </div>
          <div className="mt-2.5 flex items-center gap-2">
            <Button
              size="sm"
              variant="primary"
              loading={mutation.pending}
              disabled={reason.trim().length < 10 || status === currentStatus}
              onClick={() =>
                mutation.run('/api/faculty/attendance/correct', {
                  body: { recordId, status, reason: reason.trim() },
                })
              }
            >
              Save correction
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            {status === currentStatus ? (
              <span className="text-[12px] text-subtle">Choose a different status to continue.</span>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}
