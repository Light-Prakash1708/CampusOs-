import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { requirePermission } from '@/lib/auth/context';
import { isEnabled } from '@/lib/features';
import { EVENT_CATEGORIES } from '@/services/events';
import { getManagedEvent } from '@/services/events/organizer';
import { EventForm, type EventFormInitial } from '../../new/EventForm';

export const metadata = { title: 'Edit event' };
export const dynamic = 'force-dynamic';

/**
 * Edit an event you organise (or moderate). The server decides what an edit
 * means: a published cross-college event goes back for verification, and a
 * time or venue change on a live event is announced to everyone registered.
 */
export default async function EditEventPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission('event:create');
  if (!isEnabled(user.featureFlags, 'events_enabled')) notFound();
  const { id } = await params;
  let m;
  try {
    m = await getManagedEvent(user, id);
  } catch {
    notFound();
  }
  const e = m.event;
  const locked = e.status === 'CANCELLED' || e.endsAt < new Date();

  const initial: EventFormInitial = {
    title: e.title,
    category: e.category,
    description: e.description,
    visibility: e.visibility,
    organizerName: e.organizerName,
    mode: e.mode,
    venueText: e.venueText,
    city: e.city,
    area: e.area,
    onlineUrl: e.onlineUrl,
    startsAt: e.startsAt.toISOString(),
    endsAt: e.endsAt.toISOString(),
    capacity: e.capacity,
    registrationRequired: e.registrationRequired,
    registrationDeadline: e.registrationDeadline ? e.registrationDeadline.toISOString() : null,
    registrationMode: e.registrationMode,
    waitlistEnabled: e.waitlistEnabled,
    priceInr: e.priceInr,
    certificateOffered: e.certificateOffered,
    teamSizeMin: e.teamSizeMin,
    teamSizeMax: e.teamSizeMax,
    eligibility: e.eligibility,
    rules: e.rules,
    prizes: e.prizes,
    tags: e.tags ?? [],
    contactEmail: e.contactEmail,
    agenda: e.agenda ?? [],
    faqs: e.faqs ?? [],
  };

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Link href={`/organize/${e.id}`} className="inline-flex min-h-[44px] items-center gap-1.5 text-[13px] font-bold text-muted hover:text-default">
        <ArrowLeft size={15} aria-hidden /> Back to the event
      </Link>
      <header>
        <h1 className="font-display text-[28px] font-extrabold text-default">Edit event</h1>
        <p className="mt-1 text-[14px] text-muted">
          {e.status === 'SCHEDULED'
            ? 'Changing the time or venue notifies everyone registered and following. A cross-college event goes back for verification after edits.'
            : 'Save your changes, then keep managing the event from its page.'}
        </p>
      </header>
      {locked ? (
        <p className="rounded-xl border-[1.5px] border-ink bg-sun p-4 text-[13.5px] font-semibold text-sun-ink">
          {e.status === 'CANCELLED' ? 'This event was cancelled, so it can’t be edited.' : 'This event has ended, so it can’t be edited.'}
        </p>
      ) : (
        <EventForm
          categories={Object.entries(EVENT_CATEGORIES).map(([value, label]) => ({ value, label }))}
          canPublic
          initial={initial}
          eventId={e.id}
        />
      )}
    </div>
  );
}
