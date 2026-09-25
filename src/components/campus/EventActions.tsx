'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Bookmark, BookmarkCheck, Check, Clock, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

async function call(url: string, method: 'POST' | 'DELETE', body?: unknown) {
  const res = await fetch(url, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({ ok: false, error: { message: 'Unexpected response.' } }));
  return json as { ok: boolean; data?: Record<string, unknown>; error?: { message: string; hint?: string } };
}

/** Bookmark = follow: saved events send their organisers' updates to you. */
export function SaveToggle({ eventId, saved: initial, title }: { eventId: string; saved: boolean; title: string }) {
  const router = useRouter();
  const [saved, setSaved] = React.useState(initial);
  const [busy, setBusy] = React.useState(false);
  async function toggle() {
    setBusy(true);
    const next = !saved;
    setSaved(next);
    const r = await call(`/api/events/${eventId}/save`, next ? 'POST' : 'DELETE');
    if (!r.ok) setSaved(!next);
    setBusy(false);
    router.refresh();
  }
  const Icon = saved ? BookmarkCheck : Bookmark;
  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      aria-pressed={saved}
      aria-label={saved ? `Unsave ${title}` : `Save ${title} and get its updates`}
      title={saved ? 'Saved — you’ll get updates' : 'Save & follow updates'}
      className={cn(
        'flex h-9 w-9 items-center justify-center rounded-lg border-[1.5px] border-ink shadow-pop transition-colors',
        saved ? 'bg-brand text-white' : 'bg-surface text-default hover:bg-lavender',
      )}
    >
      <Icon size={16} aria-hidden />
    </button>
  );
}

export type RegState = 'REGISTERED' | 'WAITLISTED' | 'PENDING_APPROVAL' | 'REJECTED' | 'CANCELLED' | null;

/**
 * The single primary action on an event: Register · Join waitlist · Registered ✓ ·
 * Notify me. Errors explain what happened and what to do next.
 */
export function RegisterControl({
  eventId,
  status,
  registrationRequired,
  closed,
  full,
  waitlistEnabled,
  saved,
  size = 'md',
  allowCancel = false,
  waitlistPosition,
}: {
  eventId: string;
  status: RegState;
  registrationRequired: boolean;
  closed: boolean;
  full: boolean;
  waitlistEnabled: boolean;
  saved: boolean;
  size?: 'md' | 'lg';
  allowCancel?: boolean;
  waitlistPosition?: number | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<{ message: string; hint?: string } | null>(null);
  const [confirmCancel, setConfirmCancel] = React.useState(false);
  const h = size === 'lg' ? 'min-h-[48px] text-[15px]' : 'min-h-[40px] text-[13.5px]';
  const base = cn('flex w-full items-center justify-center gap-1.5 rounded-xl border-[1.5px] border-ink font-extrabold shadow-pop campus-press disabled:opacity-60', h);

  async function register() {
    setBusy(true);
    setError(null);
    const r = await call(`/api/events/${eventId}/register`, 'POST', {});
    setBusy(false);
    if (!r.ok) setError(r.error ?? { message: 'Could not register.' });
    router.refresh();
  }
  async function cancel() {
    setBusy(true);
    const r = await call(`/api/events/${eventId}/register`, 'DELETE');
    setBusy(false);
    setConfirmCancel(false);
    if (!r.ok) setError(r.error ?? { message: 'Could not cancel.' });
    router.refresh();
  }
  async function notify() {
    setBusy(true);
    await call(`/api/events/${eventId}/save`, 'POST');
    setBusy(false);
    router.refresh();
  }

  let control: React.ReactNode;
  if (status === 'REGISTERED') {
    control = (
      <div className="space-y-1.5">
        <span className={cn(base, 'bg-mint text-mint-ink shadow-none')} role="status">
          <Check size={16} aria-hidden /> Registered
        </span>
        {allowCancel ? (
          confirmCancel ? (
            <button onClick={cancel} disabled={busy} className="w-full text-center text-[12.5px] font-bold text-coral-ink hover:underline">
              {busy ? 'Cancelling…' : 'Tap again to give up your place'}
            </button>
          ) : (
            <button onClick={() => setConfirmCancel(true)} className="w-full text-center text-[12.5px] font-semibold text-subtle hover:underline">
              Can’t make it? Cancel registration
            </button>
          )
        ) : null}
      </div>
    );
  } else if (status === 'WAITLISTED') {
    control = (
      <div className="space-y-1.5">
        <span className={cn(base, 'bg-sun text-sun-ink shadow-none')} role="status">
          <Clock size={16} aria-hidden /> Waitlisted{waitlistPosition ? ` · #${waitlistPosition}` : ''}
        </span>
        {allowCancel ? (
          <button onClick={cancel} disabled={busy} className="w-full text-center text-[12.5px] font-semibold text-subtle hover:underline">
            Leave waitlist
          </button>
        ) : null}
      </div>
    );
  } else if (status === 'PENDING_APPROVAL') {
    control = (
      <span className={cn(base, 'bg-sky text-sky-ink shadow-none')} role="status">
        <Clock size={16} aria-hidden /> Awaiting approval
      </span>
    );
  } else if (status === 'REJECTED') {
    control = <span className={cn(base, 'bg-surface-sunken text-muted shadow-none')}>Not selected</span>;
  } else if (!registrationRequired || closed || (full && !waitlistEnabled)) {
    control = saved ? (
      <span className={cn(base, 'bg-lavender text-lavender-ink shadow-none')}>
        <BookmarkCheck size={16} aria-hidden /> You’ll be notified
      </span>
    ) : (
      <button onClick={notify} disabled={busy} className={cn(base, 'bg-surface text-brand')}>
        {busy ? <Loader2 size={16} className="animate-spin" /> : null}
        {!registrationRequired ? 'Notify me' : closed ? 'Registration closed · Notify me' : 'Full · Notify me'}
      </button>
    );
  } else {
    control = (
      <button onClick={register} disabled={busy} className={cn(base, full ? 'bg-sun text-sun-ink' : 'bg-brand text-white')}>
        {busy ? <Loader2 size={16} className="animate-spin" /> : null}
        {full ? 'Join waitlist' : 'Register'}
      </button>
    );
  }

  return (
    <div>
      {control}
      {error ? (
        <p className="mt-1.5 text-[12px] font-semibold text-coral-ink" role="alert">
          {error.message} {error.hint ?? ''}
        </p>
      ) : null}
    </div>
  );
}
