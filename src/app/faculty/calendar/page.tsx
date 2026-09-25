import Link from 'next/link';
import { and, eq, gte, inArray, isNull, lte, or, sql } from 'drizzle-orm';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { db } from '@/lib/db';
import * as t from '@/lib/db/schema';
import { requireAuth } from '@/lib/auth/context';
import {
  Badge,
  Button,
  Card,
  CardBody,
  EmptyState,
  PageHeader,
  Section,
} from '@/components/ui';
import { cn, formatDate, formatTime, humanize } from '@/lib/utils';
import {
  dayNameOf,
  fromISODate,
  getCurrentTerm,
  getMyOfferings,
  getMySchedule,
  getPublishedVersionId,
  toISODate,
  type DayName,
} from '../_lib/faculty';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Calendar · CampusOS' };

type ItemKind = 'CLASS' | 'HOLIDAY' | 'EVENT' | 'EXAM' | 'DEADLINE' | 'LEAVE';

interface CalendarItem {
  date: string;
  kind: ItemKind;
  title: string;
  detail: string | null;
  time: string | null;
  href?: string;
}

const KIND_TONE: Record<ItemKind, 'brand' | 'danger' | 'info' | 'warning' | 'success' | 'neutral'> = {
  CLASS: 'brand',
  HOLIDAY: 'danger',
  EVENT: 'info',
  EXAM: 'warning',
  DEADLINE: 'warning',
  LEAVE: 'neutral',
};

function monthBounds(month: string): { first: Date; last: Date } {
  const [y, m] = month.split('-').map(Number);
  const first = new Date(y ?? 1970, (m ?? 1) - 1, 1, 12);
  const last = new Date(y ?? 1970, m ?? 1, 0, 12);
  return { first, last };
}

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y ?? 1970, (m ?? 1) - 1 + delta, 1, 12);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const user = await requireAuth();
  const { month: monthParam } = await searchParams;

  const today = new Date();
  const month =
    monthParam && /^\d{4}-\d{2}$/.test(monthParam)
      ? monthParam
      : `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;

  const { first, last } = monthBounds(month);
  const fromISO = toISODate(first);
  const toISO = toISODate(last);

  const term = await getCurrentTerm(user.institutionId);
  const offerings = await getMyOfferings(user, term?.id ?? null);
  const offeringIds = offerings.map((o) => o.id);
  const versionId = term ? await getPublishedVersionId(user.institutionId, term.id) : null;
  const schedule = versionId ? await getMySchedule(user, versionId) : [];

  const [holidays, events, exams, deadlines, leaves] = await Promise.all([
    db
      .select({ date: t.holidays.date, name: t.holidays.name, isHalfDay: t.holidays.isHalfDay })
      .from(t.holidays)
      .where(
        and(
          eq(t.holidays.institutionId, user.institutionId),
          gte(t.holidays.date, fromISO),
          lte(t.holidays.date, toISO),
        ),
      ),
    db
      .select({
        id: t.events.id,
        title: t.events.title,
        startsAt: t.events.startsAt,
        venueText: t.events.venueText,
        roomCode: t.rooms.code,
        status: t.events.status,
      })
      .from(t.events)
      .leftJoin(t.rooms, eq(t.rooms.id, t.events.roomId))
      .where(
        and(
          eq(t.events.institutionId, user.institutionId),
          isNull(t.events.deletedAt),
          gte(t.events.startsAt, first),
          lte(t.events.startsAt, new Date(last.getTime() + 86_400_000)),
        ),
      ),
    user.facultyProfileId
      ? db
          .selectDistinct({
            id: t.assessments.id,
            title: t.assessments.title,
            date: t.assessments.date,
            startsAt: t.assessments.startsAt,
            kind: t.assessments.kind,
          })
          .from(t.assessments)
          .leftJoin(
            t.assessmentAllocations,
            eq(t.assessmentAllocations.assessmentId, t.assessments.id),
          )
          .where(
            and(
              eq(t.assessments.institutionId, user.institutionId),
              isNull(t.assessments.deletedAt),
              gte(t.assessments.date, fromISO),
              lte(t.assessments.date, toISO),
              or(
                offeringIds.length
                  ? inArray(t.assessments.offeringId, offeringIds)
                  : sql`false`,
                eq(t.assessmentAllocations.invigilatorId, user.facultyProfileId),
              ),
            ),
          )
      : [],
    offeringIds.length
      ? db
          .select({
            id: t.assignments.id,
            title: t.assignments.title,
            dueAt: t.assignments.dueAt,
            offeringId: t.assignments.offeringId,
          })
          .from(t.assignments)
          .where(
            and(
              eq(t.assignments.institutionId, user.institutionId),
              inArray(t.assignments.offeringId, offeringIds),
              isNull(t.assignments.deletedAt),
              eq(t.assignments.status, 'PUBLISHED'),
              gte(t.assignments.dueAt, first),
              lte(t.assignments.dueAt, new Date(last.getTime() + 86_400_000)),
            ),
          )
      : [],
    db
      .select({
        id: t.leaveRequests.id,
        reference: t.leaveRequests.reference,
        fromDate: t.leaveRequests.fromDate,
        toDate: t.leaveRequests.toDate,
        status: t.leaveRequests.status,
        leaveType: t.leaveRequests.leaveType,
      })
      .from(t.leaveRequests)
      .where(
        and(
          eq(t.leaveRequests.institutionId, user.institutionId),
          eq(t.leaveRequests.requesterId, user.userId),
          lte(t.leaveRequests.fromDate, toISO),
          gte(t.leaveRequests.toDate, fromISO),
        ),
      ),
  ]);

  const offeringById = new Map(offerings.map((o) => [o.id, o]));
  const holidayDates = new Set(holidays.map((h) => h.date));
  const items: CalendarItem[] = [];

  for (const h of holidays) {
    items.push({
      date: h.date,
      kind: 'HOLIDAY',
      title: h.name,
      detail: h.isHalfDay ? 'Half day' : 'Institution holiday',
      time: null,
    });
  }

  // Classes come from the weekly pattern, expanded across the month and
  // suppressed on holidays — we never show a class the institution is closed for.
  const cursor = new Date(first);
  while (cursor <= last) {
    const dateISO = toISODate(cursor);
    if (!holidayDates.has(dateISO) && (!term || (dateISO >= term.startDate && dateISO <= term.endDate))) {
      const day: DayName = dayNameOf(cursor);
      for (const entry of schedule.filter((e) => e.dayOfWeek === day && !e.isCancelled)) {
        items.push({
          date: dateISO,
          kind: 'CLASS',
          title: `${entry.subjectCode} · ${entry.sectionCode}`,
          detail: `Room ${entry.roomCode ?? 'not allocated'}`,
          time: entry.startTime,
          href: `/faculty/attendance?offering=${entry.offeringId}&date=${dateISO}&entry=${entry.entryId}`,
        });
      }
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  for (const e of events) {
    items.push({
      date: toISODate(e.startsAt),
      kind: 'EVENT',
      title: e.title,
      detail: `${e.roomCode ?? e.venueText ?? 'Venue not set'}${
        e.status === 'CANCELLED' ? ' · cancelled' : ''
      }`,
      time: e.startsAt.toTimeString().slice(0, 5),
    });
  }

  for (const e of exams) {
    if (!e.date) continue;
    items.push({
      date: e.date,
      kind: 'EXAM',
      title: e.title,
      detail: humanize(e.kind),
      time: e.startsAt ? e.startsAt.toTimeString().slice(0, 5) : null,
    });
  }

  for (const d of deadlines) {
    if (!d.dueAt) continue;
    items.push({
      date: toISODate(d.dueAt),
      kind: 'DEADLINE',
      title: `Due: ${d.title}`,
      detail: offeringById.get(d.offeringId)?.sectionCode ?? null,
      time: d.dueAt.toTimeString().slice(0, 5),
      href: `/faculty/assignments/${d.id}`,
    });
  }

  for (const l of leaves) {
    const start = l.fromDate < fromISO ? fromISO : l.fromDate;
    const end = l.toDate > toISO ? toISO : l.toDate;
    const c = fromISODate(start);
    while (toISODate(c) <= end) {
      items.push({
        date: toISODate(c),
        kind: 'LEAVE',
        title: `${humanize(l.leaveType)} leave (${l.status.toLowerCase()})`,
        detail: l.reference,
        time: null,
        href: '/faculty/leave',
      });
      c.setDate(c.getDate() + 1);
    }
  }

  const byDate = new Map<string, CalendarItem[]>();
  for (const item of items) {
    const list = byDate.get(item.date) ?? [];
    list.push(item);
    byDate.set(item.date, list);
  }
  for (const list of byDate.values()) {
    list.sort((a, b) => (a.time ?? '').localeCompare(b.time ?? ''));
  }

  // Grid cells: pad to the Monday before the first of the month.
  const leading = (first.getDay() + 6) % 7;
  const cells: (string | null)[] = Array.from({ length: leading }, () => null);
  for (let d = 1; d <= last.getDate(); d += 1) {
    cells.push(toISODate(new Date(first.getFullYear(), first.getMonth(), d, 12)));
  }

  const todayISO = toISODate(today);
  const agenda = [...byDate.entries()]
    .filter(([date]) => date >= todayISO)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(0, 10);

  return (
    <div>
      <PageHeader
        title="Calendar"
        description={
          term
            ? `${term.name} · classes, holidays, exams, deadlines, events and your leave`
            : 'No current academic term is set.'
        }
        action={
          <div className="flex items-center gap-1.5">
            <Button asChild size="sm" variant="secondary" icon={ChevronLeft}>
              <Link href={`/faculty/calendar?month=${shiftMonth(month, -1)}`}>Previous</Link>
            </Button>
            <Button asChild size="sm" variant="secondary" iconRight={ChevronRight}>
              <Link href={`/faculty/calendar?month=${shiftMonth(month, 1)}`}>Next</Link>
            </Button>
          </div>
        }
      />

      <Section
        title={first.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}
      >
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <div className="min-w-[700px]">
              <div className="grid grid-cols-7 border-b border-[hsl(var(--border))]">
                {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
                  <div
                    key={d}
                    className="px-2 py-2 text-[12px] font-semibold uppercase tracking-wide text-subtle"
                  >
                    {d}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7">
                {cells.map((date, i) => (
                  <div
                    key={i}
                    className={cn(
                      'min-h-[104px] border-b border-r border-[hsl(var(--border))] p-1.5',
                      date === todayISO && 'bg-brand-subtle',
                      date && holidayDates.has(date) && 'bg-danger-subtle',
                    )}
                  >
                    {date ? (
                      <>
                        <p
                          className={cn(
                            'tabular mb-1 text-[12px]',
                            date === todayISO
                              ? 'font-semibold text-brand'
                              : 'text-subtle',
                          )}
                        >
                          {Number(date.slice(8))}
                        </p>
                        <ul className="space-y-0.5">
                          {(byDate.get(date) ?? []).slice(0, 3).map((item, j) => (
                            <li key={j} className="truncate text-[11px] leading-tight">
                              <span
                                className={cn(
                                  'mr-1 inline-block h-1.5 w-1.5 rounded-full align-middle',
                                  item.kind === 'CLASS' && 'bg-brand',
                                  item.kind === 'HOLIDAY' && 'bg-danger',
                                  item.kind === 'EVENT' && 'bg-info',
                                  item.kind === 'EXAM' && 'bg-warning',
                                  item.kind === 'DEADLINE' && 'bg-warning',
                                  item.kind === 'LEAVE' && 'bg-[hsl(var(--text-subtle))]',
                                )}
                                aria-hidden
                              />
                              <span className="text-muted">{item.title}</span>
                            </li>
                          ))}
                          {(byDate.get(date) ?? []).length > 3 ? (
                            <li className="text-[11px] text-subtle">
                              +{(byDate.get(date) ?? []).length - 3} more
                            </li>
                          ) : null}
                        </ul>
                      </>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          </div>
          <CardBody className="flex flex-wrap gap-3 border-t border-[hsl(var(--border))] py-3 text-[12px] text-muted">
            <Legend colour="bg-brand" label="Class" />
            <Legend colour="bg-danger" label="Holiday" />
            <Legend colour="bg-warning" label="Exam or deadline" />
            <Legend colour="bg-info" label="Event" />
            <Legend colour="bg-[hsl(var(--text-subtle))]" label="Your leave" />
          </CardBody>
        </Card>
      </Section>

      <Section title="What is coming up">
        <Card>
          {agenda.length === 0 ? (
            <EmptyState
              icon={CalendarDays}
              title="Nothing scheduled for the rest of this month"
              description="Classes, exams, deadlines, events and holidays all appear here."
            />
          ) : (
            <ul className="divide-y divide-[hsl(var(--border))]">
              {agenda.map(([date, list]) => (
                <li key={date} className="px-5 py-3.5">
                  <p className="text-[12.5px] font-semibold text-subtle">
                    {formatDate(fromISODate(date))}
                    {date === todayISO ? ' · today' : ''}
                  </p>
                  <ul className="mt-2 space-y-1.5">
                    {list.map((item, i) => (
                      <li key={i} className="flex flex-wrap items-center gap-2">
                        <span className="tabular w-[70px] shrink-0 text-[12.5px] text-muted">
                          {item.time ? formatTime(item.time) : 'All day'}
                        </span>
                        <Badge tone={KIND_TONE[item.kind]}>{item.kind.toLowerCase()}</Badge>
                        {item.href ? (
                          <Link
                            href={item.href}
                            className="text-[13px] text-default hover:text-brand"
                          >
                            {item.title}
                          </Link>
                        ) : (
                          <span className="text-[13px] text-default">{item.title}</span>
                        )}
                        {item.detail ? (
                          <span className="text-[12px] text-subtle">{item.detail}</span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </Section>
    </div>
  );
}

function Legend({ colour, label }: { colour: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn('h-2 w-2 rounded-full', colour)} aria-hidden />
      {label}
    </span>
  );
}
