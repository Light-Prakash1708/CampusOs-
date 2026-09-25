import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Plus } from 'lucide-react';
import { requirePermission } from '@/lib/auth/context';
import { isEnabled } from '@/lib/features';
import { CampusCard, CampusEmptyState, CampusPill } from '@/components/campus';
import { categoryTone, formatEventDates } from '@/components/campus/events';
import { EVENT_CATEGORIES } from '@/services/events';
import { listManagedEvents } from '@/services/events/organizer';

export const metadata = { title: 'Organise' };
export const dynamic = 'force-dynamic';

const STATUS: Record<string, { label: string; tone: 'mint' | 'sun' | 'coral' | 'sky' | 'lavender' }> = {
  SCHEDULED: { label: 'Live', tone: 'mint' },
  PENDING_APPROVAL: { label: 'Awaiting approval', tone: 'sun' },
  DRAFT: { label: 'Draft / changes requested', tone: 'sky' },
  CANCELLED: { label: 'Cancelled', tone: 'coral' },
  COMPLETED: { label: 'Completed', tone: 'lavender' },
};

export default async function OrganizePage() {
  const user = await requirePermission('event:create');
  if (!isEnabled(user.featureFlags, 'events_enabled')) notFound();
  const events = await listManagedEvents(user);
  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-[28px] font-extrabold text-default">Organise</h1>
          <p className="mt-1 text-[14px] text-muted">
            Run registrations, check-in, updates and certificates in one place.
            {user.permissions.has('event:approve') ? ' As a moderator you also see every event at your college.' : ' New events are reviewed by your college before they go live.'}
          </p>
        </div>
        <Link href="/organize/new" className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border-[1.5px] border-ink bg-brand px-4 text-[14px] font-extrabold text-white shadow-pop campus-press">
          <Plus size={17} aria-hidden /> Create event
        </Link>
      </header>
      {events.length === 0 ? (
        <CampusCard className="py-4">
          <CampusEmptyState sprite="robot" title="No events yet" description="Create your first event — a workshop, a club meet-up or a competition." />
        </CampusCard>
      ) : (
        <CampusCard className="overflow-hidden">
          <ul className="divide-y divide-[hsl(var(--border))]">
            {events.map((e) => (
              <li key={e.id}>
                <Link href={`/organize/${e.id}`} className="flex flex-wrap items-center gap-3 px-4 py-3 hover:bg-surface-sunken/60">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-display text-[15px] font-extrabold text-default">{e.title}</p>
                    <p className="text-[12.5px] text-muted">{formatEventDates(e.startsAt, e.startsAt)} · {e.visibility === 'PUBLIC' ? 'Open to all colleges' : 'Your college only'}</p>
                  </div>
                  <CampusPill tone={categoryTone(e.category)}>{EVENT_CATEGORIES[e.category as keyof typeof EVENT_CATEGORIES] ?? 'Event'}</CampusPill>
                  <CampusPill tone={STATUS[e.status]?.tone ?? 'sky'}>{STATUS[e.status]?.label ?? e.status}</CampusPill>
                  <span className="tabular w-36 text-right text-[12.5px] font-semibold text-muted">
                    {e.registered}{e.capacity ? `/${e.capacity}` : ''} registered · {e.checkedIn} in
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </CampusCard>
      )}
    </div>
  );
}
