'use client';

import * as React from 'react';
import { Flag } from 'lucide-react';

/** Low-key "report this event" — fake events, spam, wrong details. */
export function ReportEvent({ eventId }: { eventId: string }) {
  const [open, setOpen] = React.useState(false);
  const [reason, setReason] = React.useState('WRONG_DETAILS');
  const [details, setDetails] = React.useState('');
  const [done, setDone] = React.useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch(`/api/events/${eventId}/report`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ reason, details: details || null }),
    });
    if (res.ok) setDone(true);
  }
  if (done) return <p className="text-[12.5px] text-subtle" role="status">Thanks — moderators will review this event.</p>;
  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-subtle hover:text-default">
        <Flag size={13} aria-hidden /> Report this event
      </button>
    );
  }
  return (
    <form onSubmit={submit} className="flex flex-wrap items-end gap-2 rounded-xl border-[1.5px] border-[hsl(var(--border-strong))] bg-surface p-3">
      <label className="text-[12px] font-bold text-muted">
        Reason
        <select value={reason} onChange={(e) => setReason(e.target.value)} className="mt-1 block h-9 rounded-lg border border-[hsl(var(--border-strong))] bg-surface px-2 text-[13px] text-default">
          <option value="WRONG_DETAILS">Wrong details</option>
          <option value="FAKE">Looks fake</option>
          <option value="SPAM">Spam</option>
          <option value="INAPPROPRIATE">Inappropriate</option>
          <option value="OTHER">Something else</option>
        </select>
      </label>
      <label className="min-w-[200px] flex-1 text-[12px] font-bold text-muted">
        Details (optional)
        <input value={details} onChange={(e) => setDetails(e.target.value)} maxLength={1000} className="mt-1 block h-9 w-full rounded-lg border border-[hsl(var(--border-strong))] bg-surface px-2 text-[13px] text-default" />
      </label>
      <button type="submit" className="h-9 rounded-lg border-[1.5px] border-ink bg-surface px-3 text-[13px] font-bold text-default">Send report</button>
    </form>
  );
}
