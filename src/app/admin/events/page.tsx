import Link from 'next/link';
import { and, desc, eq, gte, isNull, sql } from 'drizzle-orm';
import { CalendarDays, Plus } from 'lucide-react';
import { db } from '@/lib/db';
import * as t from '@/lib/db/schema';
import { requireAnyPermission, can } from '@/lib/auth/context';
import { Badge, Card, CardHeader, EmptyState, PageHeader, Section, Table, Td, Th } from '@/components/ui';
import { CampusPill } from '@/components/campus';
import { categoryTone } from '@/components/campus/events';
import { EVENT_CATEGORIES } from '@/services/events';
import { listModerationQueue } from '@/services/events/organizer';
import { formatDateTime, humanize, relativeTime } from '@/lib/utils';
import { ModerationActions, ReportActions } from './ModerationActions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Events · CampusOS' };

/**
 * Admin event dashboard: moderation queue, reports, engagement at a glance,
 * and every event at the college. (Fixes v1 D8: now capability-checked.)
 */
export default async function EventsPage() {
  const user = await requireAnyPermission(['event:approve', 'event:create']);
  const moderator = can(user, 'event:approve');

  const [queue, rows, stats, popular] = await Promise.all([
    moderator ? listModerationQueue(user) : Promise.resolve({ pending: [], reports: [] }),
    db
      .select({
        id: t.events.id,
        title: t.events.title,
        startsAt: t.events.startsAt,
        status: t.events.status,
        category: t.events.category,
        visibility: t.events.visibility,
        capacity: t.events.capacity,
        organizerName: t.events.organizerName,
        registered: sql<number>`(SELECT count(*)::int FROM event_registrations r WHERE r.event_id = "events"."id" AND r.status = 'REGISTERED')`,
        checkedIn: sql<number>`(SELECT count(*)::int FROM event_checkins c WHERE c.event_id = "events"."id")`,
      })
      .from(t.events)
      .where(and(eq(t.events.institutionId, user.institutionId), isNull(t.events.deletedAt)))
      .orderBy(desc(t.events.startsAt))
      .limit(100),
    db.execute<{ upcoming: number; registrations: number; attended: number; past_registrations: number }>(sql`
      SELECT
        (SELECT count(*)::int FROM events WHERE institution_id = ${user.institutionId} AND status = 'SCHEDULED' AND starts_at > now() AND deleted_at IS NULL) AS upcoming,
        (SELECT count(*)::int FROM event_registrations r JOIN events e ON e.id = r.event_id WHERE e.institution_id = ${user.institutionId} AND r.status = 'REGISTERED') AS registrations,
        (SELECT count(*)::int FROM event_registrations r JOIN events e ON e.id = r.event_id WHERE e.institution_id = ${user.institutionId} AND r.status = 'REGISTERED' AND r.attended_at IS NOT NULL) AS attended,
        (SELECT count(*)::int FROM event_registrations r JOIN events e ON e.id = r.event_id WHERE e.institution_id = ${user.institutionId} AND r.status = 'REGISTERED' AND e.ends_at < now()) AS past_registrations
    `),
    db
      .select({ category: t.events.category, n: sql<number>`count(*)::int` })
      .from(t.events)
      .where(and(eq(t.events.institutionId, user.institutionId), gte(t.events.startsAt, sql`now() - interval '180 days'`), isNull(t.events.deletedAt)))
      .groupBy(t.events.category)
      .orderBy(desc(sql`count(*)`))
      .limit(5),
  ]);
  const s = stats.rows[0] ?? { upcoming: 0, registrations: 0, attended: 0, past_registrations: 0 };
  const showRate = s.past_registrations ? Math.round((s.attended / s.past_registrations) * 100) : null;

  return (
    <div>
      <PageHeader
        title="Events"
        description="Moderate, track and run events. Room bookings remain conflict-checked against the timetable."
        action={
          <Link href="/organize/new" className="inline-flex h-10 items-center gap-1.5 rounded-lg border-[1.5px] border-ink bg-brand px-4 text-sm font-semibold text-white shadow-pop campus-press">
            <Plus size={16} aria-hidden /> Create event
          </Link>
        }
      />

      <Section title="At a glance">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          {[
            ['Upcoming events', s.upcoming],
            ['Registrations', s.registrations],
            ['Attendance rate', showRate === null ? '—' : `${showRate}%`],
            ['Awaiting approval', queue.pending.length],
            ['Open reports', queue.reports.length],
          ].map(([label, value]) => (
            <Card key={label as string} className="p-4">
              <p className="text-[12.5px] font-semibold text-muted">{label}</p>
              <p className="tabular font-display text-[26px] font-extrabold text-default">{value}</p>
            </Card>
          ))}
        </div>
        {popular.length ? (
          <p className="mt-3 flex flex-wrap items-center gap-1.5 text-[12.5px] text-muted">
            Popular categories (6 months):
            {popular.map((p) => (
              <CampusPill key={p.category} tone={categoryTone(p.category)}>
                {EVENT_CATEGORIES[p.category as keyof typeof EVENT_CATEGORIES] ?? p.category} · {p.n}
              </CampusPill>
            ))}
          </p>
        ) : null}
      </Section>

      {moderator ? (
        <Section title="Waiting for approval">
          <Card>
            {queue.pending.length === 0 ? (
              <EmptyState icon={CalendarDays} title="Nothing to review" description="Events created by students and clubs wait here before going live." />
            ) : (
              <ul className="divide-y divide-[hsl(var(--border))]">
                {queue.pending.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                    <div className="min-w-0 flex-1">
                      <Link href={`/organize/${p.id}`} className="font-bold text-default hover:underline">{p.title}</Link>
                      <p className="text-[12.5px] text-muted">
                        {p.organizerName ?? 'Unnamed organiser'} · {humanize(p.organizerType)} · {formatDateTime(p.startsAt)} ·{' '}
                        {p.visibility === 'PUBLIC' ? 'wants to be public' : 'college only'} · submitted {relativeTime(p.createdAt)}
                      </p>
                    </div>
                    <ModerationActions eventId={p.id} />
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </Section>
      ) : null}

      {moderator && queue.reports.length ? (
        <Section title="Reported events">
          <Card>
            <ul className="divide-y divide-[hsl(var(--border))]">
              {queue.reports.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-default">{r.eventTitle}</p>
                    <p className="text-[12.5px] text-muted">{humanize(r.reason)}{r.details ? ` — “${r.details}”` : ''} · {relativeTime(r.createdAt)}</p>
                  </div>
                  <ReportActions reportId={r.id} eventId={r.eventId} />
                </li>
              ))}
            </ul>
          </Card>
        </Section>
      ) : null}

      <Section title="All events">
        <Card>
          <CardHeader title={`${rows.length} events`} />
          {rows.length === 0 ? (
            <EmptyState icon={CalendarDays} title="No events yet" description="Create one, or approve events submitted by clubs and students." />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Event</Th>
                  <Th>When</Th>
                  <Th>Category</Th>
                  <Th align="right">Registered</Th>
                  <Th align="right">Checked in</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((e) => (
                  <tr key={e.id} className="hover:bg-surface-sunken">
                    <Td>
                      <Link href={`/organize/${e.id}`} className="text-[13.5px] font-bold text-default hover:underline">{e.title}</Link>
                      <span className="block text-[11.5px] text-subtle">{e.organizerName ?? '—'} · {e.visibility === 'PUBLIC' ? 'Public' : 'College only'}</span>
                    </Td>
                    <Td><span className="text-[12.5px] text-muted">{formatDateTime(e.startsAt)}</span></Td>
                    <Td><CampusPill tone={categoryTone(e.category)}>{EVENT_CATEGORIES[e.category as keyof typeof EVENT_CATEGORIES] ?? e.category}</CampusPill></Td>
                    <Td align="right" className="tabular text-muted">{e.registered}{e.capacity ? ` / ${e.capacity}` : ''}</Td>
                    <Td align="right" className="tabular text-muted">{e.checkedIn}</Td>
                    <Td><Badge tone={e.status === 'SCHEDULED' ? 'success' : e.status === 'PENDING_APPROVAL' ? 'warning' : e.status === 'CANCELLED' ? 'danger' : 'neutral'}>{humanize(e.status)}</Badge></Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      </Section>
    </div>
  );
}
