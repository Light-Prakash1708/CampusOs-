'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui';
import { useApi } from '@/components/auth/useApi';

export function ModerationActions({ eventId }: { eventId: string }) {
  const router = useRouter();
  const api = useApi();
  const [note, setNote] = React.useState('');
  const act = async (action: 'APPROVE' | 'REJECT' | 'REQUEST_CHANGES') => {
    const d = await api.call(`/api/events/${eventId}/moderate`, { action, note: note || null });
    if (d) router.refresh();
  };
  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="sr-only" htmlFor={`note-${eventId}`}>Note to organiser</label>
      <input
        id={`note-${eventId}`}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Note to organiser (optional)"
        className="h-8 w-52 rounded-lg border border-[hsl(var(--border-strong))] bg-surface px-2 text-[12.5px]"
      />
      <Button size="sm" variant="ghost" loading={api.loading} onClick={() => act('REQUEST_CHANGES')}>Request changes</Button>
      <Button size="sm" variant="ghost" loading={api.loading} onClick={() => act('REJECT')}>Reject</Button>
      <Button size="sm" variant="primary" loading={api.loading} onClick={() => act('APPROVE')}>Approve</Button>
      {api.error ? <span className="text-[12px] text-coral-ink">{api.error.message}</span> : null}
    </div>
  );
}

export function ReportActions({ reportId, eventId }: { reportId: string; eventId: string }) {
  const router = useRouter();
  const api = useApi();
  const [confirm, setConfirm] = React.useState(false);
  return (
    <div className="flex items-center gap-2">
      <Button size="sm" variant="ghost" loading={api.loading} onClick={async () => { if (await api.call(`/api/events/reports/${reportId}`, { action: 'DISMISS' })) router.refresh(); }}>
        Dismiss
      </Button>
      {confirm ? (
        <Button size="sm" variant="danger" loading={api.loading} onClick={async () => { if (await api.call(`/api/events/${eventId}/moderate`, { action: 'SUSPEND', note: 'Suspended after a report' })) router.refresh(); }}>
          Confirm suspend
        </Button>
      ) : (
        <Button size="sm" variant="secondary" onClick={() => setConfirm(true)}>Suspend event</Button>
      )}
    </div>
  );
}
