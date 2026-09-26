'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Scale } from 'lucide-react';
import { Button, Card, CardBody, CardHeader, Field, Textarea } from '@/components/ui';
import { ErrorBox, useApi } from '@/components/auth/useApi';

/**
 * Appeal to the Ombudsperson — offered only while the case is appealable
 * (within 15 days of the committee's decision).
 */
export function AppealPanel({ grievanceId, deadline }: { grievanceId: string; deadline: string }) {
  const router = useRouter();
  const api = useApi<{ ombudspersonDueAt: string }>();
  const [open, setOpen] = React.useState(false);
  const [reason, setReason] = React.useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (await api.call(`/api/grievances/${grievanceId}/appeal`, { reason })) router.refresh();
  }

  return (
    <Card className="mb-5">
      <CardHeader
        title="Not satisfied with the decision?"
        icon={Scale}
        description={`You can appeal to your college’s Ombudsperson until ${new Date(deadline).toLocaleDateString('en-IN', { dateStyle: 'medium' })}.`}
      />
      <CardBody>
        {!open ? (
          <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>Appeal to the Ombudsperson</Button>
        ) : (
          <form onSubmit={submit} className="space-y-3" noValidate>
            <Field label="Why are you appealing?" htmlFor="appeal-reason" error={api.fieldError('reason')} hint="Say what was not addressed. The Ombudsperson aims to decide within 30 days.">
              <Textarea id="appeal-reason" rows={4} maxLength={2000} value={reason} onChange={(e) => setReason(e.target.value)} />
            </Field>
            <ErrorBox error={api.error} />
            <div className="flex gap-2">
              <Button type="submit" size="sm" variant="primary" loading={api.loading} disabled={reason.trim().length < 10}>Send appeal</Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            </div>
          </form>
        )}
      </CardBody>
    </Card>
  );
}
