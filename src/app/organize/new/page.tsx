import { notFound } from 'next/navigation';
import { requirePermission } from '@/lib/auth/context';
import { isEnabled } from '@/lib/features';
import { EVENT_CATEGORIES } from '@/services/events';
import { EventForm } from './EventForm';

export const metadata = { title: 'Create event' };

export default async function NewEventPage() {
  const user = await requirePermission('event:create');
  if (!isEnabled(user.featureFlags, 'events_enabled')) notFound();
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <header>
        <h1 className="font-display text-[28px] font-extrabold text-default">Create an event</h1>
        <p className="mt-1 text-[14px] text-muted">
          {user.permissions.has('event:approve')
            ? 'Events you create go live immediately as a verified college event.'
            : 'Your college reviews new events before students see them. You’ll get a notification when it’s approved.'}
        </p>
      </header>
      <EventForm categories={Object.entries(EVENT_CATEGORIES).map(([value, label]) => ({ value, label }))} canPublic />
    </div>
  );
}
