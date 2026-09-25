import Link from 'next/link';
import { and, eq, gte, lte } from 'drizzle-orm';
import { CalendarOff, CalendarX2, Info, TriangleAlert } from 'lucide-react';
import { db } from '@/lib/db';
import * as t from '@/lib/db/schema';
import { requirePermission } from '@/lib/auth/context';
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
import { cn, formatDate, formatTime, humanize, pluralize } from '@/lib/utils';
import {
  WEEK_DAYS,
  dayNameOf,
  getCurrentTerm,
  getMyFacultyProfile,
  getMySchedule,
  getPublishedVersionId,
  getSlotGrid,
  isOutsideAvailability,
  toISODate,
  unavailableDays,
  type AvailabilityWindow,
  type DayName,
  type ScheduleEntry,
} from '../_lib/faculty';
import { NoFacultyProfile } from '../_components/NoFacultyProfile';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'My schedule · CampusOS' };

/** The next calendar date, from today, on which a weekday falls. */
function nextDateFor(day: DayName, from = new Date()): string {
  const cursor = new Date(from.getFullYear(), from.getMonth(), from.getDate(), 12);
  for (let i = 0; i < 7; i += 1) {
    if (dayNameOf(cursor) === day) return toISODate(cursor);
    cursor.setDate(cursor.getDate() + 1);
  }
  return toISODate(from);
}

export default async function SchedulePage() {
  const user = await requirePermission('timetable:view_own');

  if (!user.facultyProfileId) {
    return (
      <div>
        <PageHeader title="My schedule" />
        <NoFacultyProfile what="Your teaching week" />
      </div>
    );
  }

  const [term, profile] = await Promise.all([
    getCurrentTerm(user.institutionId),
    getMyFacultyProfile(user),
  ]);

  if (!term) {
    return (
      <div>
        <PageHeader title="My schedule" />
        <Alert tone="warning" icon={TriangleAlert} title="No current academic term">
          Your institution has not marked a term as current, so no timetable can be resolved.
        </Alert>
      </div>
    );
  }

  const versionId = await getPublishedVersionId(user.institutionId, term.id);
  if (!versionId) {
    return (
      <div>
        <PageHeader title="My schedule" description={term.name} />
        <Card>
          <EmptyState
            icon={CalendarOff}
            title="No timetable is published for this term"
            description="A draft or proposed timetable is not shown here — only a published one is authoritative. The academic office publishes it from the admin portal."
          />
        </Card>
      </div>
    );
  }

  const [entries, slots] = await Promise.all([
    getMySchedule(user, versionId),
    getSlotGrid(user.institutionId),
  ]);

  const today = new Date();
  const exceptions = await db
    .select({
      entryId: t.scheduleExceptions.entryId,
      date: t.scheduleExceptions.date,
      kind: t.scheduleExceptions.kind,
      reason: t.scheduleExceptions.reason,
      newRoomCode: t.rooms.code,
    })
    .from(t.scheduleExceptions)
    .leftJoin(t.rooms, eq(t.rooms.id, t.scheduleExceptions.newRoomId))
    .where(
      and(
        eq(t.scheduleExceptions.institutionId, user.institutionId),
        gte(t.scheduleExceptions.date, today),
        lte(
          t.scheduleExceptions.date,
          new Date(today.getTime() + 14 * 24 * 60 * 60 * 1000),
        ),
      ),
    );
  const exceptionByEntry = new Map(
    exceptions.filter((e) => e.entryId).map((e) => [e.entryId as string, e]),
  );

  const windows = (profile?.availability ?? []) as AvailabilityWindow[];
  const offDays = unavailableDays(windows);
  const teachingSlots = slots.filter((s) => s.kind === 'TEACHING');
  const byDay = new Map<DayName, ScheduleEntry[]>();
  for (const day of WEEK_DAYS) {
    byDay.set(
      day,
      entries.filter((e) => e.dayOfWeek === day).sort((a, b) => a.position - b.position),
    );
  }
  const todayName = dayNameOf(today);
  const clashes = entries.filter((e) =>
    isOutsideAvailability(windows, e.dayOfWeek, e.startTime, e.endTime),
  );

  return (
    <div>
      <PageHeader
        title="My schedule"
        description={`${term.name} · ${pluralize(entries.length, 'period')} a week across ${
          new Set(entries.map((e) => e.sectionCode)).size
        } sections`}
        action={
          <Button asChild variant="secondary">
            <Link href="/faculty/classes">My classes</Link>
          </Button>
        }
      />

      {profile?.constraintNotes ? (
        <Alert tone="info" icon={Info} title="Your recorded availability" className="mb-4">
          {profile.constraintNotes}
          {offDays.length > 0 ? (
            <>
              {' '}
              The solver treats{' '}
              {offDays.map((d) => humanize(d)).join(', ')} as unavailable for you.
            </>
          ) : null}
        </Alert>
      ) : null}

      {clashes.length > 0 ? (
        <Alert tone="warning" icon={TriangleAlert} title="Scheduled against your availability" className="mb-4">
          {pluralize(clashes.length, 'period')} in the published timetable falls outside the
          availability recorded on your profile:{' '}
          {clashes.map((c) => `${humanize(c.dayOfWeek)} ${formatTime(c.startTime)}`).join(', ')}.
          Raise a timetable readdressal case if this is wrong.
        </Alert>
      ) : null}

      {entries.length === 0 ? (
        <Card>
          <EmptyState
            icon={CalendarOff}
            title="You have no periods in the published timetable"
            description="Nothing has been scheduled against your faculty record for this term."
          />
        </Card>
      ) : (
        <>
          <Section title="Week grid">
            <Card className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] border-collapse text-sm">
                  <thead>
                    <tr>
                      <th className="w-[110px] border-b border-[hsl(var(--border))] px-3 py-2.5 text-left text-[12px] font-semibold uppercase tracking-wide text-subtle">
                        Period
                      </th>
                      {WEEK_DAYS.map((day) => (
                        <th
                          key={day}
                          className={cn(
                            'border-b border-l border-[hsl(var(--border))] px-3 py-2.5 text-left text-[12px] font-semibold uppercase tracking-wide',
                            day === todayName ? 'bg-brand-subtle text-brand' : 'text-subtle',
                            offDays.includes(day) && 'bg-surface-sunken',
                          )}
                        >
                          {day.slice(0, 3)}
                          {offDays.includes(day) ? (
                            <span className="ml-1 font-normal normal-case text-subtle">(off)</span>
                          ) : null}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {teachingSlots.map((slot) => (
                      <tr key={slot.position}>
                        <td className="border-b border-[hsl(var(--border))] px-3 py-2 align-top">
                          <p className="tabular text-[12.5px] font-medium text-default">
                            {formatTime(slot.startTime)}
                          </p>
                          <p className="tabular text-[11.5px] text-subtle">
                            {formatTime(slot.endTime)}
                          </p>
                        </td>
                        {WEEK_DAYS.map((day) => {
                          const entry = byDay
                            .get(day)!
                            .find((e) => e.position === slot.position);
                          return (
                            <td
                              key={day}
                              className={cn(
                                'border-b border-l border-[hsl(var(--border))] px-2 py-1.5 align-top',
                                offDays.includes(day) && 'bg-surface-sunken',
                              )}
                            >
                              {entry ? (
                                <div
                                  className={cn(
                                    'rounded-md border px-2 py-1.5',
                                    entry.isCancelled
                                      ? 'border-[hsl(var(--danger-border))] bg-danger-subtle'
                                      : 'border-[hsl(var(--brand-border))] bg-brand-subtle',
                                  )}
                                >
                                  <p className="text-[12px] font-semibold text-default">
                                    {entry.subjectCode}
                                  </p>
                                  <p className="text-[11.5px] text-muted">
                                    {entry.sectionCode} · {entry.roomCode ?? 'no room'}
                                  </p>
                                </div>
                              ) : null}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </Section>

          <Section title="Day by day">
            <div className="space-y-4">
              {WEEK_DAYS.map((day) => {
                const dayEntries = byDay.get(day)!;
                if (dayEntries.length === 0 && !offDays.includes(day)) return null;
                const dateForDay = nextDateFor(day);
                return (
                  <Card key={day}>
                    <CardHeader
                      title={humanize(day)}
                      description={
                        offDays.includes(day)
                          ? 'Recorded as unavailable on your profile'
                          : `${pluralize(dayEntries.length, 'period')} · next on ${formatDate(
                              new Date(`${dateForDay}T12:00:00`),
                            )}`
                      }
                      action={
                        day === todayName ? <Badge tone="brand">Today</Badge> : undefined
                      }
                    />
                    {dayEntries.length === 0 ? (
                      <CardBody>
                        <p className="text-[13px] text-muted">No periods scheduled.</p>
                      </CardBody>
                    ) : (
                      <ul className="divide-y divide-[hsl(var(--border))]">
                        {dayEntries.map((entry) => {
                          const exception = exceptionByEntry.get(entry.entryId);
                          const outside = isOutsideAvailability(
                            windows,
                            entry.dayOfWeek,
                            entry.startTime,
                            entry.endTime,
                          );
                          return (
                            <li
                              key={entry.entryId}
                              className="flex flex-wrap items-center gap-3 px-5 py-3"
                            >
                              <div className="w-[96px] shrink-0">
                                <p className="tabular text-[13px] font-semibold text-default">
                                  {formatTime(entry.startTime)}
                                </p>
                                <p className="tabular text-[11.5px] text-subtle">
                                  {formatTime(entry.endTime)}
                                </p>
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-[13.5px] font-medium text-default">
                                  {entry.subjectCode} {entry.subjectName}
                                </p>
                                <p className="text-[12.5px] text-muted">
                                  {entry.sectionCode} · Room{' '}
                                  {exception?.newRoomCode ?? entry.roomCode ?? 'not allocated'}
                                  {entry.roomBuilding && !exception?.newRoomCode
                                    ? `, ${entry.roomBuilding}`
                                    : ''}
                                </p>
                                {entry.note ? (
                                  <p className="mt-0.5 text-[12px] text-subtle">{entry.note}</p>
                                ) : null}
                                {exception ? (
                                  <p className="mt-0.5 text-[12px] text-warning">
                                    {formatDate(exception.date)}:{' '}
                                    {humanize(exception.kind).toLowerCase()} — {exception.reason}
                                  </p>
                                ) : null}
                                {outside ? (
                                  <p className="mt-0.5 text-[12px] text-warning">
                                    Outside your recorded availability.
                                  </p>
                                ) : null}
                              </div>
                              <div className="flex items-center gap-2">
                                {entry.isCancelled ? <Badge tone="danger">Cancelled</Badge> : null}
                                <Button asChild size="sm" variant="secondary" icon={CalendarX2}>
                                  <Link
                                    href={`/faculty/leave?entry=${entry.entryId}&date=${dateForDay}`}
                                  >
                                    I can&rsquo;t take this class
                                  </Link>
                                </Button>
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </Card>
                );
              })}
            </div>
          </Section>
        </>
      )}
    </div>
  );
}
