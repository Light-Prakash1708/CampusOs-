import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Award, BookmarkCheck, MapPin, Search, SlidersHorizontal, Ticket } from 'lucide-react';
import { isEnabled } from '@/lib/features';
import {
  CampusCard,
  CampusEmptyState,
  CampusIllustration,
  CampusTabs,
} from '@/components/campus';
import { CampusEventCard } from '@/components/campus/events';
import { RegisterControl, SaveToggle } from '@/components/campus/EventActions';
import { DISCOVERY_TABS, EVENT_CATEGORIES, listEvents, myEventCounts, type EventFilters } from '@/services/events';
import { requireStudentContext } from '../_lib/auth';

export const metadata = { title: 'Events' };
export const dynamic = 'force-dynamic';

type SP = Record<string, string | undefined>;

export default async function EventsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireStudentContext();
  if (!isEnabled(user.featureFlags, 'events_enabled')) notFound();
  const sp = await searchParams;
  const crossCollege = isEnabled(user.featureFlags, 'event_discovery_enabled');

  const filters: EventFilters = {
    tab: sp.tab ?? 'all',
    q: sp.q,
    city: sp.city,
    when: (sp.when as EventFilters['when']) ?? 'upcoming',
    mode: sp.mode as EventFilters['mode'],
    free: sp.free === '1',
    certificate: sp.certificate === '1',
    mine: sp.mine as EventFilters['mine'],
    radiusKm: sp.radius ? Number(sp.radius) : undefined,
    sort: (sp.sort as EventFilters['sort']) ?? 'relevance',
  };
  const [events, counts] = await Promise.all([listEvents(user, filters), myEventCounts(user)]);

  const qs = (patch: SP) => {
    const next = new URLSearchParams(Object.entries({ ...sp, ...patch }).filter(([, v]) => v) as [string, string][]);
    const s = next.toString();
    return s ? `/student/events?${s}` : '/student/events';
  };
  const cityLabel = sp.city ?? 'Kolkata';
  const activeFilters = ['when', 'mode', 'free', 'certificate', 'mine', 'radius', 'q'].filter((k) => sp[k] && !(k === 'when' && sp[k] === 'upcoming')).length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <CampusTabs
          label="Event categories"
          active={filters.tab ?? 'all'}
          tabs={DISCOVERY_TABS.map((d) => ({ key: d.key, label: d.label, href: qs({ tab: d.key === 'all' ? undefined : d.key }) }))}
          className="min-w-0 flex-1"
        />
        <div className="flex items-center gap-2">
          <Link href="/student/events?mine=registered" className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border-[1.5px] border-[hsl(var(--border-strong))] bg-surface px-3 text-[12.5px] font-bold text-default hover:border-ink">
            <Ticket size={14} aria-hidden /> My events <span className="tabular text-subtle">{(counts.REGISTERED ?? 0) + (counts.WAITLISTED ?? 0) + (counts.PENDING_APPROVAL ?? 0)}</span>
          </Link>
          <Link href="/student/certificates" className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border-[1.5px] border-[hsl(var(--border-strong))] bg-surface px-3 text-[12.5px] font-bold text-default hover:border-ink">
            <Award size={14} aria-hidden /> Certificates
          </Link>
        </div>
      </div>

      <section className="overflow-hidden rounded-2xl campus-outline" aria-labelledby="events-title">
        <h1 id="events-title" className="sr-only">Explore beyond your classroom</h1>
        <p className="sr-only">Fests. Hackathons. Competitions. Workshops. All in one place for Kolkata and beyond.</p>
        <CampusIllustration name="events-hero" priority sizes="(min-width: 1280px) 1100px, 100vw" className="max-h-[260px] object-cover object-left" />
      </section>

      <form action="/student/events" method="get" className="space-y-3" role="search" aria-label="Find events">
        {sp.tab ? <input type="hidden" name="tab" value={sp.tab} /> : null}
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="mr-auto font-display text-[20px] font-extrabold text-default">
            {filters.mine === 'registered' ? 'My events' : filters.mine === 'saved' ? 'Saved events' : `Events near ${cityLabel}`}
          </h2>
          <label className="relative flex min-w-[220px] flex-1 items-center sm:flex-none">
            <span className="sr-only">Search events</span>
            <Search size={15} className="pointer-events-none absolute left-3 text-subtle" aria-hidden />
            <input
              name="q"
              defaultValue={sp.q}
              placeholder="Search events, competitions, internships…"
              className="h-10 w-full rounded-xl border-[1.5px] border-[hsl(var(--border-strong))] bg-surface pl-9 pr-3 text-[13px] text-default placeholder:text-subtle focus:border-ink sm:w-72"
            />
          </label>
          <label className="flex items-center gap-1.5">
            <span className="sr-only">Sort</span>
            <select name="sort" defaultValue={filters.sort} className="h-10 rounded-xl border-[1.5px] border-[hsl(var(--border-strong))] bg-surface px-2.5 text-[13px] font-semibold text-default">
              <option value="relevance">Sort: Relevance</option>
              <option value="date">Sort: Date</option>
            </select>
          </label>
        </div>

        <details className="group rounded-xl border-[1.5px] border-[hsl(var(--border-strong))] bg-surface open:border-ink" open={activeFilters > 0}>
          <summary className="flex min-h-[44px] cursor-pointer list-none items-center gap-2 px-3 text-[13px] font-bold text-default">
            <SlidersHorizontal size={15} aria-hidden /> Filters {activeFilters ? <span className="rounded-md bg-brand px-1.5 text-[11px] text-white">{activeFilters}</span> : null}
          </summary>
          <div className="grid gap-3 border-t border-[hsl(var(--border))] p-3 sm:grid-cols-2 lg:grid-cols-4">
            <Filter label="When" name="when" value={sp.when ?? 'upcoming'} options={[['upcoming', 'Any upcoming'], ['today', 'Today'], ['weekend', 'This weekend'], ['week', 'Next 7 days'], ['month', 'Next 30 days'], ['past', 'Past events']]} />
            <Filter label="Location" name="city" value={sp.city ?? ''} options={[['', 'Anywhere'], ['Kolkata', 'Kolkata'], ['Howrah', 'Howrah']]} />
            <Filter label="Distance from campus" name="radius" value={sp.radius ?? ''} options={[['', 'Any distance'], ['5', 'Within 5 km'], ['15', 'Within 15 km'], ['30', 'Within 30 km']]} />
            <Filter label="Format" name="mode" value={sp.mode ?? ''} options={[['', 'Online & offline'], ['OFFLINE', 'Offline'], ['ONLINE', 'Online'], ['HYBRID', 'Hybrid']]} />
            <Filter label="Show" name="mine" value={sp.mine ?? ''} options={[['', 'All events'], ['college', 'My college only'], ['registered', 'Registered'], ['saved', 'Saved']]} />
            <Check name="free" label="Free only" checked={sp.free === '1'} />
            <Check name="certificate" label="Gives a certificate" checked={sp.certificate === '1'} />
            <div className="flex items-end gap-2">
              <button type="submit" className="min-h-[40px] flex-1 rounded-xl border-[1.5px] border-ink bg-brand px-4 text-[13px] font-extrabold text-white shadow-pop campus-press">Apply</button>
              <Link href="/student/events" className="min-h-[40px] rounded-xl px-3 py-2.5 text-[13px] font-semibold text-muted hover:text-default">Reset</Link>
            </div>
          </div>
        </details>
      </form>

      {!crossCollege ? (
        <p className="flex items-center gap-1.5 text-[12.5px] text-subtle">
          <MapPin size={13} aria-hidden /> Showing events at {user.institutionName}. Your college has not switched on discovery across other colleges.
        </p>
      ) : null}

      {events.length === 0 ? (
        <CampusCard className="py-4">
          <CampusEmptyState
            sprite="student"
            title={filters.mine === 'saved' ? 'Nothing saved yet' : filters.mine === 'registered' ? 'You haven’t registered for anything yet' : 'No events nearby yet'}
            description={filters.mine ? 'Bookmark events to follow their updates.' : 'Try another category, widen the distance, or look at online events.'}
            action={
              <Link href="/student/events?mode=ONLINE" className="inline-flex min-h-[40px] items-center rounded-xl border-[1.5px] border-ink bg-brand px-4 text-[13px] font-extrabold text-white shadow-pop">
                Explore online events
              </Link>
            }
          />
        </CampusCard>
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label={`${events.length} events`}>
          {events.map((e) => {
            const full = e.capacity !== null && e.registeredCount >= e.capacity;
            const closed = (!!e.registrationDeadline && e.registrationDeadline < new Date()) || e.status !== 'SCHEDULED' || e.endsAt < new Date();
            return (
              <li key={e.id}>
                <CampusEventCard
                  event={e}
                  href={`/student/events/${e.id}`}
                  categoryLabel={EVENT_CATEGORIES[e.category as keyof typeof EVENT_CATEGORIES] ?? 'Event'}
                  bookmark={<SaveToggle eventId={e.id} saved={e.saved} title={e.title} />}
                  action={
                    <RegisterControl
                      eventId={e.id}
                      status={e.myStatus}
                      registrationRequired={e.registrationRequired}
                      closed={closed}
                      full={full}
                      waitlistEnabled
                      saved={e.saved}
                    />
                  }
                />
              </li>
            );
          })}
        </ul>
      )}

      <p className="flex items-center justify-center gap-1.5 text-center text-[12px] text-subtle">
        <BookmarkCheck size={13} aria-hidden /> Save an event to get its venue changes, reminders and results — no WhatsApp group needed.
        {events.some((e) => e.demo) ? ' Events marked “Demo” are fictional sample data.' : ''}
      </p>
    </div>
  );
}

function Filter({ label, name, value, options }: { label: string; name: string; value: string; options: [string, string][] }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[12px] font-bold text-muted">{label}</span>
      <select name={name} defaultValue={value} className="h-10 w-full rounded-lg border-[1.5px] border-[hsl(var(--border-strong))] bg-surface px-2.5 text-[13px] text-default">
        {options.map(([v, l]) => (
          <option key={v} value={v}>{l}</option>
        ))}
      </select>
    </label>
  );
}

function Check({ name, label, checked }: { name: string; label: string; checked: boolean }) {
  return (
    <label className="flex min-h-[40px] items-center gap-2 self-end text-[13px] font-semibold text-default">
      <input type="checkbox" name={name} value="1" defaultChecked={checked} className="h-4 w-4 accent-[hsl(var(--brand))]" />
      {label}
    </label>
  );
}
