import Link from 'next/link';
import {
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  DoorOpen,
  Info,
  PartyPopper,
  User,
} from 'lucide-react';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  PageHeader,
  Section,
} from '@/components/ui';
import { cn, formatDate, formatTime, humanize } from '@/lib/utils';
import { requireStudentContext } from '../_lib/auth';
import {
  getCurrentTerm,
  getEnrolledOfferings,
  getInstitutionTimezone,
  getPeriodGrid,
  getPublishedTimetable,
  getScheduleExceptions,
  getWeeklyClasses,
} from '../_lib/student';
import { getHolidays } from '../_lib/campus';
import { occurrencesForDate, type ClassOccurrence } from '../_lib/schedule';
import {
  addIsoDays,
  DAY_LABEL,
  DAY_SHORT,
  dayOfIso,
  formatIsoDayLabel,
  isoToDate,
  weekStartIso,
  zonedNow,
  type DayName,
} from '../_lib/time';

export const metadata = { title: 'My Schedule' };
export const dynamic = 'force-dynamic';

export default async function SchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const user = await requireStudentContext('timetable:view_own');
  const { week } = await searchParams;

  const timeZone = await getInstitutionTimezone(user.institutionId);
  const now = zonedNow(timeZone);

  const requestedWeek = /^\d{4}-\d{2}-\d{2}$/.test(week ?? '') ? (week as string) : now.today;
  const monday = weekStartIso(requestedWeek);
  const isCurrentWeek = monday === weekStartIso(now.today);

  const term = await getCurrentTerm(user.institutionId);
  const timetable = term ? await getPublishedTimetable(user.institutionId, term.id) : null;

  const [{ periods, days, slotDays }, offerings] = await Promise.all([
    getPeriodGrid(user.institutionId),
    getEnrolledOfferings(user.institutionId, user.studentProfileId),
  ]);

  const classes =
    timetable && user.sectionId
      ? await getWeeklyClasses(user.institutionId, user.sectionId, timetable.versionId)
      : [];

  const weekEnd = addIsoDays(monday, 7);
  const [exceptions, holidays] = await Promise.all([
    getScheduleExceptions(
      user.institutionId,
      offerings.map((o) => o.offeringId),
      classes.map((c) => c.entryId),
      monday,
      weekEnd,
    ),
    getHolidays(user.institutionId, monday, weekEnd),
  ]);

  const holidayByDate = new Map(holidays.map((h) => [h.date, h]));

  // One resolved day per column, so the grid and the mobile list agree.
  const dayDates = new Map<DayName, string>();
  for (let i = 0; i < 7; i += 1) {
    const iso = addIsoDays(monday, i);
    dayDates.set(dayOfIso(iso), iso);
  }

  const byDay = new Map<DayName, ClassOccurrence[]>();
  for (const day of days) {
    const iso = dayDates.get(day);
    byDay.set(day, iso ? occurrencesForDate(iso, classes, exceptions) : []);
  }

  const weekLabel = `${formatIsoDayLabel(monday)} – ${formatIsoDayLabel(addIsoDays(monday, 6))}`;

  return (
    <>
      <PageHeader
        title="My Schedule"
        description={
          timetable
            ? `${timetable.versionName} · published ${formatDate(timetable.publishedAt)}`
            : 'No timetable has been published for your section yet.'
        }
        action={
          <div className="flex items-center gap-1">
            <Button asChild size="icon" variant="secondary" aria-label="Previous week">
              <Link href={`/student/schedule?week=${addIsoDays(monday, -7)}`}>
                <ChevronLeft size={16} />
              </Link>
            </Button>
            <Button asChild size="sm" variant={isCurrentWeek ? 'subtle' : 'secondary'}>
              <Link href="/student/schedule">This week</Link>
            </Button>
            <Button asChild size="icon" variant="secondary" aria-label="Next week">
              <Link href={`/student/schedule?week=${addIsoDays(monday, 7)}`}>
                <ChevronRight size={16} />
              </Link>
            </Button>
          </div>
        }
      />

      {!timetable ? (
        <Card>
          <CardBody className="p-0">
            <EmptyState
              icon={CalendarClock}
              title="No published timetable"
              description="Your section's timetable for this term has not been published. Draft and proposed timetables are deliberately not shown — they are not commitments yet."
            />
          </CardBody>
        </Card>
      ) : (
        <>
          <p className="mb-4 text-[13px] text-muted">
            <span className="font-medium text-default">{weekLabel}</span>
            {isCurrentWeek ? ' · current week' : ''}
          </p>

          {/* ------------------------- Week deviations ------------------------ */}
          {exceptions.length > 0 || holidays.length > 0 ? (
            <Section title="This week is different">
              <div className="space-y-2.5">
                {exceptions.map((e) => (
                  <Alert
                    key={e.id}
                    tone={e.kind === 'CANCELLED' ? 'danger' : 'warning'}
                    icon={Info}
                    title={`${e.subjectCode ? `${e.subjectCode} — ` : ''}${humanize(e.kind)} on ${formatIsoDayLabel(e.dateIso)}`}
                  >
                    {e.reason}
                    {e.newRoomCode ? ` · now in Room ${e.newRoomCode}` : ''}
                    {e.newFacultyName ? ` · taken by ${e.newFacultyName}` : ''}
                    {e.newSlotLabel ? ` · now at ${e.newSlotLabel}` : ''}
                  </Alert>
                ))}
                {holidays.map((h) => (
                  <Alert
                    key={h.id}
                    tone="info"
                    icon={PartyPopper}
                    title={`${h.name} — ${formatIsoDayLabel(h.date)}`}
                  >
                    {h.isHalfDay
                      ? 'Half day. Afternoon periods are suspended.'
                      : 'No classes are held on this day.'}
                    {h.description ? ` ${h.description}` : ''}
                  </Alert>
                ))}
              </div>
            </Section>
          ) : null}

          {/* ----------------------------- Grid ------------------------------ */}
          <Card className="hidden overflow-hidden md:block">
            <div className="overflow-x-auto">
              <div className="min-w-[720px]">
                <div
                  className="grid border-b border-[hsl(var(--border))] bg-surface-muted"
                  style={{ gridTemplateColumns: `84px repeat(${days.length}, minmax(0, 1fr))` }}
                >
                  <div className="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-subtle">
                    Period
                  </div>
                  {days.map((day) => {
                    const iso = dayDates.get(day) ?? '';
                    const isToday = iso === now.today;
                    const holiday = holidayByDate.get(iso);
                    return (
                      <div
                        key={day}
                        className={cn(
                          'border-l border-[hsl(var(--border))] px-3 py-2.5',
                          isToday && 'bg-brand-subtle',
                        )}
                      >
                        <p
                          className={cn(
                            'text-[12px] font-semibold',
                            isToday ? 'text-brand' : 'text-default',
                          )}
                        >
                          {DAY_SHORT[day]}
                        </p>
                        <p className="text-[11px] text-subtle">
                          {isoToDate(iso).toLocaleDateString('en-IN', {
                            day: 'numeric',
                            month: 'short',
                            timeZone: 'UTC',
                          })}
                          {holiday ? ` · ${holiday.isHalfDay ? 'half day' : 'holiday'}` : ''}
                        </p>
                      </div>
                    );
                  })}
                </div>

                {periods.map((period) => {
                  if (period.kind !== 'TEACHING') {
                    return (
                      <div
                        key={period.position}
                        className="grid border-b border-[hsl(var(--border))] bg-surface-sunken"
                        style={{
                          gridTemplateColumns: `84px repeat(${days.length}, minmax(0, 1fr))`,
                        }}
                      >
                        <div className="px-3 py-1.5 text-[11px] text-subtle">
                          {formatTime(period.startTime)}
                        </div>
                        <div
                          className="px-3 py-1.5 text-[11.5px] font-medium uppercase tracking-wide text-subtle"
                          style={{ gridColumn: `span ${days.length}` }}
                        >
                          {period.label}
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div
                      key={period.position}
                      className="grid border-b border-[hsl(var(--border))] last:border-b-0"
                      style={{
                        gridTemplateColumns: `84px repeat(${days.length}, minmax(0, 1fr))`,
                      }}
                    >
                      <div className="px-3 py-3">
                        <p className="text-[11.5px] font-medium text-default">{period.label}</p>
                        <p className="tabular text-[11px] text-subtle">
                          {formatTime(period.startTime)}
                        </p>
                      </div>
                      {days.map((day) => {
                        const iso = dayDates.get(day) ?? '';
                        const isToday = iso === now.today;
                        const exists = slotDays.has(`${day}:${period.position}`);
                        const occurrence = (byDay.get(day) ?? []).find(
                          (o) => o.position === period.position,
                        );

                        return (
                          <div
                            key={`${day}-${period.position}`}
                            className={cn(
                              'border-l border-[hsl(var(--border))] p-2',
                              isToday && 'bg-brand-subtle/40',
                              !exists && 'bg-surface-sunken',
                            )}
                          >
                            {occurrence ? (
                              <ClassCell occurrence={occurrence} />
                            ) : exists ? (
                              <span className="block px-1 py-2 text-[11.5px] text-subtle">
                                Free
                              </span>
                            ) : (
                              <span className="sr-only">No period</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          </Card>

          {/* --------------------------- Mobile list -------------------------- */}
          <div className="space-y-4 md:hidden">
            {days.map((day) => {
              const iso = dayDates.get(day) ?? '';
              const isToday = iso === now.today;
              const holiday = holidayByDate.get(iso);
              const occurrences = byDay.get(day) ?? [];

              return (
                <Card key={day} className={cn(isToday && 'border-[hsl(var(--brand-border))]')}>
                  <CardHeader
                    title={DAY_LABEL[day]}
                    description={isoToDate(iso).toLocaleDateString('en-IN', {
                      day: 'numeric',
                      month: 'long',
                      timeZone: 'UTC',
                    })}
                    action={
                      isToday ? (
                        <Badge tone="brand" dot>
                          today
                        </Badge>
                      ) : holiday ? (
                        <Badge tone="info">{holiday.isHalfDay ? 'half day' : 'holiday'}</Badge>
                      ) : null
                    }
                  />
                  <CardBody className="p-0">
                    {occurrences.length === 0 ? (
                      <p className="px-5 py-4 text-[13px] text-muted">No classes scheduled.</p>
                    ) : (
                      <ul className="divide-y divide-[hsl(var(--border))]">
                        {occurrences.map((o) => (
                          <li key={o.key} className="px-5 py-3">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p
                                  className={cn(
                                    'text-[13.5px] font-medium',
                                    o.status === 'CANCELLED'
                                      ? 'text-subtle line-through'
                                      : 'text-default',
                                  )}
                                >
                                  {o.subjectName}
                                </p>
                                <p className="text-[11.5px] text-subtle">{o.subjectCode}</p>
                              </div>
                              <span className="tabular shrink-0 text-[12.5px] text-muted">
                                {formatTime(o.startTime)}
                              </span>
                            </div>
                            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-muted">
                              <span className="inline-flex items-center gap-1">
                                <DoorOpen size={12} className="text-subtle" aria-hidden />
                                {o.roomCode ? `Room ${o.roomCode}` : 'Room TBC'}
                              </span>
                              <span className="inline-flex items-center gap-1">
                                <User size={12} className="text-subtle" aria-hidden />
                                {o.facultyName ?? 'Faculty TBC'}
                              </span>
                            </div>
                            {o.status !== 'SCHEDULED' ? (
                              <p className="mt-1.5">
                                <Badge tone={o.status === 'CANCELLED' ? 'danger' : 'warning'}>
                                  {humanize(o.status)}
                                </Badge>
                              </p>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    )}
                  </CardBody>
                </Card>
              );
            })}
          </div>

          {classes.length === 0 ? (
            <Card className="mt-4">
              <CardBody className="p-0">
                <EmptyState
                  icon={CalendarClock}
                  title="No periods scheduled for your section"
                  description="The published timetable contains no entries for your section. If that looks wrong, raise it through the Readdressal Centre."
                  action={
                    <Button asChild size="sm" variant="secondary">
                      <Link href="/student/readdressal/new?category=timetable">Raise a case</Link>
                    </Button>
                  }
                />
              </CardBody>
            </Card>
          ) : null}
        </>
      )}
    </>
  );
}

function ClassCell({ occurrence }: { occurrence: ClassOccurrence }) {
  const cancelled = occurrence.status === 'CANCELLED';
  return (
    <div
      className={cn(
        'rounded-md border p-2',
        cancelled
          ? 'border-[hsl(var(--danger-border))] bg-danger-subtle'
          : occurrence.status !== 'SCHEDULED'
            ? 'border-[hsl(var(--warning-border))] bg-warning-subtle'
            : 'border-[hsl(var(--border))] bg-surface',
      )}
    >
      <p
        className={cn(
          'truncate text-[12.5px] font-semibold',
          cancelled ? 'text-danger line-through' : 'text-default',
        )}
        title={occurrence.subjectName}
      >
        {occurrence.subjectCode}
      </p>
      <p className="truncate text-[11.5px] text-muted" title={occurrence.subjectName}>
        {occurrence.subjectName}
      </p>
      <p className="mt-1 truncate text-[11px] text-subtle">
        {occurrence.roomCode ? `Room ${occurrence.roomCode}` : 'Room TBC'}
      </p>
      <p className="truncate text-[11px] text-subtle">{occurrence.facultyName ?? 'Faculty TBC'}</p>
    </div>
  );
}
