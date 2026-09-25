import Link from 'next/link';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  PageHeader,
  Section,
  type BadgeTone,
} from '@/components/ui';
import { cn, formatTime, humanize, pluralize } from '@/lib/utils';
import { isEnabled } from '@/lib/features';
import { requireStudentContext } from '../_lib/auth';
import {
  getCurrentTerm,
  getEnrolledOfferings,
  getInstitutionTimezone,
  getPublishedTimetable,
  getScheduleExceptions,
  getWeeklyClasses,
} from '../_lib/student';
import { getCampusEvents, getHolidays } from '../_lib/campus';
import { getStudentAssessments, getStudentAssignments } from '../_lib/coursework';
import { occurrencesForDate } from '../_lib/schedule';
import {
  addIsoDays,
  addIsoMonths,
  DAY_SHORT,
  DAY_ORDER,
  daysInMonth,
  formatMonthLabel,
  isoToDate,
  monthStartIso,
  zonedNow,
} from '../_lib/time';

export const metadata = { title: 'Calendar' };
export const dynamic = 'force-dynamic';

type ItemKind = 'CLASS' | 'DEADLINE' | 'EXAM' | 'EVENT' | 'HOLIDAY';

interface CalendarItem {
  key: string;
  kind: ItemKind;
  title: string;
  detail: string | null;
  /** Sortable minutes-since-midnight; null for all-day items. */
  startMinutes: number | null;
  timeLabel: string | null;
  href: string;
}

const KIND_TONE: Record<ItemKind, BadgeTone> = {
  CLASS: 'neutral',
  DEADLINE: 'warning',
  EXAM: 'danger',
  EVENT: 'info',
  HOLIDAY: 'success',
};

const KIND_LABEL: Record<ItemKind, string> = {
  CLASS: 'Class',
  DEADLINE: 'Deadline',
  EXAM: 'Exam',
  EVENT: 'Event',
  HOLIDAY: 'Holiday',
};

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const user = await requireStudentContext();
  const { month: rawMonth } = await searchParams;

  const timeZone = await getInstitutionTimezone(user.institutionId);
  const now = zonedNow(timeZone);

  const monthStart = /^\d{4}-\d{2}$/.test(rawMonth ?? '')
    ? `${rawMonth}-01`
    : monthStartIso(now.today);
  const monthLength = daysInMonth(monthStart);
  const monthEnd = addIsoDays(monthStart, monthLength);

  const term = await getCurrentTerm(user.institutionId);
  const timetable = term ? await getPublishedTimetable(user.institutionId, term.id) : null;

  const [offerings, assignments, assessments, events, holidays] = await Promise.all([
    getEnrolledOfferings(user.institutionId, user.studentProfileId),
    getStudentAssignments(user.institutionId, user.studentProfileId),
    getStudentAssessments(
      user.institutionId,
      user.studentProfileId,
      user.sectionId,
      term?.id ?? null,
    ),
    isEnabled(user.featureFlags, 'events_enabled')
      ? getCampusEvents(user.institutionId, user.userId, monthStart, monthEnd)
      : Promise.resolve([]),
    getHolidays(user.institutionId, monthStart, monthEnd),
  ]);

  const classes =
    timetable && user.sectionId
      ? await getWeeklyClasses(user.institutionId, user.sectionId, timetable.versionId)
      : [];

  const exceptions = await getScheduleExceptions(
    user.institutionId,
    offerings.map((o) => o.offeringId),
    classes.map((c) => c.entryId),
    monthStart,
    monthEnd,
  );

  /* ---------------------------- Build the map ---------------------------- */

  const byDate = new Map<string, CalendarItem[]>();
  const push = (iso: string, item: CalendarItem) => {
    const list = byDate.get(iso) ?? [];
    list.push(item);
    byDate.set(iso, list);
  };

  const holidayDates = new Set(holidays.map((h) => h.date));
  for (const holiday of holidays) {
    push(holiday.date, {
      key: `holiday-${holiday.id}`,
      kind: 'HOLIDAY',
      title: holiday.name,
      detail: holiday.isHalfDay ? 'Half day' : 'No classes',
      startMinutes: null,
      timeLabel: null,
      href: '/student/calendar',
    });
  }

  // Classes are expanded from the weekly pattern, bounded by the term and
  // suppressed on full holidays — we never show a class that will not happen.
  if (timetable && term) {
    for (let i = 0; i < monthLength; i += 1) {
      const iso = addIsoDays(monthStart, i);
      if (iso < term.startDate || iso > (term.teachingEndDate ?? term.endDate)) continue;
      const holiday = holidays.find((h) => h.date === iso);
      if (holiday && !holiday.isHalfDay) continue;

      for (const occurrence of occurrencesForDate(iso, classes, exceptions)) {
        push(iso, {
          key: `class-${iso}-${occurrence.key}`,
          kind: 'CLASS',
          title: occurrence.subjectCode,
          detail: `${occurrence.subjectName}${occurrence.roomCode ? ` · Room ${occurrence.roomCode}` : ''}${
            occurrence.status !== 'SCHEDULED' ? ` · ${humanize(occurrence.status)}` : ''
          }`,
          startMinutes: minutesOf(occurrence.startTime),
          timeLabel: formatTime(occurrence.startTime),
          href: '/student/schedule',
        });
      }
    }
  }

  for (const assignment of assignments) {
    if (!assignment.dueAt) continue;
    const iso = assignment.dueAt.toISOString().slice(0, 10);
    if (iso < monthStart || iso >= monthEnd) continue;
    push(iso, {
      key: `assignment-${assignment.id}`,
      kind: 'DEADLINE',
      title: `${assignment.subjectCode} — ${assignment.title}`,
      detail:
        assignment.bucket === 'SUBMITTED' || assignment.bucket === 'EVALUATED'
          ? 'Submitted'
          : 'Due',
      startMinutes: null,
      timeLabel: null,
      href: '/student/assignments',
    });
  }

  for (const assessment of assessments) {
    if (!assessment.date) continue;
    if (assessment.date < monthStart || assessment.date >= monthEnd) continue;
    push(assessment.date, {
      key: `exam-${assessment.id}`,
      kind: 'EXAM',
      title: assessment.title,
      detail: `${assessment.subjectCode ?? ''}${assessment.roomCode ? ` · Room ${assessment.roomCode}` : ''}`,
      startMinutes: assessment.startsAt ? assessment.startsAt.getUTCHours() * 60 : null,
      timeLabel: assessment.startsAt
        ? assessment.startsAt.toLocaleTimeString('en-IN', {
            hour: 'numeric',
            minute: '2-digit',
            timeZone,
          })
        : null,
      href: '/student/assessments',
    });
  }

  for (const event of events) {
    const iso = event.startsAt.toISOString().slice(0, 10);
    push(iso, {
      key: `event-${event.id}`,
      kind: 'EVENT',
      title: event.title,
      detail: [
        event.speaker,
        event.roomCode ? `Room ${event.roomCode}` : event.venueText,
        event.status === 'CANCELLED' ? 'Cancelled' : null,
      ]
        .filter(Boolean)
        .join(' · '),
      startMinutes: event.startsAt.getUTCHours() * 60 + event.startsAt.getUTCMinutes(),
      timeLabel: event.startsAt.toLocaleTimeString('en-IN', {
        hour: 'numeric',
        minute: '2-digit',
        timeZone,
      }),
      href: '/student/calendar',
    });
  }

  for (const [, items] of byDate) {
    items.sort((a, b) => {
      const order: ItemKind[] = ['HOLIDAY', 'EXAM', 'CLASS', 'DEADLINE', 'EVENT'];
      if (a.startMinutes !== null && b.startMinutes !== null) {
        return a.startMinutes - b.startMinutes;
      }
      if (a.startMinutes !== b.startMinutes) return a.startMinutes === null ? -1 : 1;
      return order.indexOf(a.kind) - order.indexOf(b.kind);
    });
  }

  /* ------------------------------ Month grid ----------------------------- */

  const leading = (new Date(`${monthStart}T00:00:00.000Z`).getUTCDay() + 6) % 7;
  const cells: (string | null)[] = [
    ...Array.from({ length: leading }, () => null),
    ...Array.from({ length: monthLength }, (_, i) => addIsoDays(monthStart, i)),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const agenda = [...byDate.entries()]
    .filter(([iso]) => iso >= (monthStart <= now.today ? now.today : monthStart))
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(0, 14);

  const totalItems = [...byDate.values()].reduce((n, items) => n + items.length, 0);

  return (
    <>
      <PageHeader
        title="Calendar"
        description="Classes, deadlines, exams, events and holidays in one place."
        action={
          <div className="flex items-center gap-1">
            <Button asChild size="icon" variant="secondary" aria-label="Previous month">
              <Link href={`/student/calendar?month=${addIsoMonths(monthStart, -1).slice(0, 7)}`}>
                <ChevronLeft size={16} />
              </Link>
            </Button>
            <Button asChild size="sm" variant="secondary">
              <Link href="/student/calendar">Today</Link>
            </Button>
            <Button asChild size="icon" variant="secondary" aria-label="Next month">
              <Link href={`/student/calendar?month=${addIsoMonths(monthStart, 1).slice(0, 7)}`}>
                <ChevronRight size={16} />
              </Link>
            </Button>
          </div>
        }
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-[15px] font-semibold text-default">{formatMonthLabel(monthStart)}</h2>
        <div className="flex flex-wrap items-center gap-2">
          {(Object.keys(KIND_LABEL) as ItemKind[]).map((kind) => (
            <Badge key={kind} tone={KIND_TONE[kind]} dot>
              {KIND_LABEL[kind]}
            </Badge>
          ))}
        </div>
      </div>

      {totalItems === 0 ? (
        <Card>
          <CardBody className="p-0">
            <EmptyState
              icon={CalendarDays}
              title="Nothing scheduled this month"
              description="No classes, deadlines, exams, events or holidays fall in this month for you. Use the arrows to look at another month."
            />
          </CardBody>
        </Card>
      ) : (
        <>
          <Card className="mb-6 overflow-hidden">
            <div className="grid grid-cols-7 border-b border-[hsl(var(--border))] bg-surface-muted">
              {DAY_ORDER.map((day) => (
                <div
                  key={day}
                  className="px-1 py-2 text-center text-[11px] font-semibold uppercase tracking-wide text-subtle"
                >
                  <span className="hidden sm:inline">{DAY_SHORT[day]}</span>
                  <span className="sm:hidden">{DAY_SHORT[day].charAt(0)}</span>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {cells.map((iso, index) => {
                if (!iso) {
                  return (
                    <div
                      key={`blank-${index}`}
                      className="min-h-[76px] border-b border-r border-[hsl(var(--border))] bg-surface-sunken last:border-r-0"
                    />
                  );
                }
                const items = byDate.get(iso) ?? [];
                const isToday = iso === now.today;
                const isHoliday = holidayDates.has(iso);

                return (
                  <div
                    key={iso}
                    className={cn(
                      'min-h-[76px] border-b border-r border-[hsl(var(--border))] p-1 sm:p-1.5',
                      isToday && 'bg-brand-subtle',
                      isHoliday && !isToday && 'bg-success-subtle/40',
                      (index + 1) % 7 === 0 && 'border-r-0',
                    )}
                  >
                    <span
                      className={cn(
                        'tabular inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11.5px]',
                        isToday ? 'bg-brand font-semibold text-white' : 'text-muted',
                      )}
                    >
                      {Number(iso.slice(8))}
                    </span>

                    {/* Compact dots at 375px, labelled chips from sm up. */}
                    <div className="mt-1 flex flex-wrap gap-0.5 sm:hidden">
                      {items.slice(0, 4).map((item) => (
                        <span
                          key={item.key}
                          className={cn('h-1.5 w-1.5 rounded-full', dotClass(item.kind))}
                          aria-hidden
                        />
                      ))}
                      {items.length > 0 ? (
                        <span className="sr-only">{pluralize(items.length, 'item')}</span>
                      ) : null}
                    </div>

                    <ul className="mt-1 hidden space-y-0.5 sm:block">
                      {items.slice(0, 3).map((item) => (
                        <li key={item.key}>
                          <Link
                            href={item.href}
                            className={cn(
                              'block truncate rounded px-1 py-0.5 text-[10.5px] leading-tight hover:underline',
                              chipClass(item.kind),
                            )}
                            title={`${KIND_LABEL[item.kind]}: ${item.title}`}
                          >
                            {item.timeLabel ? `${item.timeLabel} ` : ''}
                            {item.title}
                          </Link>
                        </li>
                      ))}
                      {items.length > 3 ? (
                        <li className="px-1 text-[10.5px] text-subtle">
                          +{items.length - 3} more
                        </li>
                      ) : null}
                    </ul>
                  </div>
                );
              })}
            </div>
          </Card>

          <Section
            title="Agenda"
            description={
              monthStart <= now.today ? 'From today onwards' : 'From the start of the month'
            }
          >
            {agenda.length === 0 ? (
              <Card>
                <CardBody className="p-0">
                  <EmptyState
                    icon={CalendarDays}
                    title="Nothing left this month"
                    description="Everything scheduled in this month has already happened."
                  />
                </CardBody>
              </Card>
            ) : (
              <div className="space-y-3">
                {agenda.map(([iso, items]) => (
                  <Card key={iso}>
                    <CardHeader
                      title={isoToDate(iso).toLocaleDateString('en-IN', {
                        weekday: 'long',
                        day: 'numeric',
                        month: 'long',
                        timeZone: 'UTC',
                      })}
                      action={
                        iso === now.today ? (
                          <Badge tone="brand" dot>
                            today
                          </Badge>
                        ) : (
                          <span className="text-[12px] text-subtle">
                            {pluralize(items.length, 'item')}
                          </span>
                        )
                      }
                    />
                    <CardBody className="p-0">
                      <ul className="divide-y divide-[hsl(var(--border))]">
                        {items.map((item) => (
                          <li key={item.key}>
                            <Link
                              href={item.href}
                              className="flex items-start gap-3 px-5 py-2.5 transition-colors hover:bg-surface-sunken"
                            >
                              <span className="tabular w-[62px] shrink-0 pt-0.5 text-[12px] text-subtle">
                                {item.timeLabel ?? 'All day'}
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-[13.5px] font-medium text-default">
                                  {item.title}
                                </span>
                                {item.detail ? (
                                  <span className="block truncate text-[12px] text-muted">
                                    {item.detail}
                                  </span>
                                ) : null}
                              </span>
                              <Badge tone={KIND_TONE[item.kind]} className="shrink-0">
                                {KIND_LABEL[item.kind]}
                              </Badge>
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </CardBody>
                  </Card>
                ))}
              </div>
            )}
          </Section>
        </>
      )}

      {!timetable ? (
        <p className="mt-4 flex items-start gap-2 text-[12.5px] text-subtle">
          <CalendarDays size={14} className="mt-0.5 shrink-0" aria-hidden />
          Classes are not shown because no timetable has been published for your section yet.
        </p>
      ) : null}
    </>
  );
}

function minutesOf(time: string): number | null {
  const [h, m] = time.split(':');
  const hours = Number(h);
  const minutes = Number(m ?? 0);
  return Number.isNaN(hours) ? null : hours * 60 + minutes;
}

function dotClass(kind: ItemKind): string {
  switch (kind) {
    case 'EXAM':
      return 'bg-danger';
    case 'DEADLINE':
      return 'bg-warning';
    case 'EVENT':
      return 'bg-info';
    case 'HOLIDAY':
      return 'bg-success';
    default:
      return 'bg-brand';
  }
}

function chipClass(kind: ItemKind): string {
  switch (kind) {
    case 'EXAM':
      return 'bg-danger-subtle text-danger';
    case 'DEADLINE':
      return 'bg-warning-subtle text-warning';
    case 'EVENT':
      return 'bg-info-subtle text-info';
    case 'HOLIDAY':
      return 'bg-success-subtle text-success';
    default:
      return 'bg-surface-sunken text-muted';
  }
}
