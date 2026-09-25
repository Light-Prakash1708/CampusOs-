import Link from 'next/link';
import { and, asc, desc, eq, gte, inArray, isNull, lte, sql } from 'drizzle-orm';
import {
  AlertTriangle,
  CalendarClock,
  CheckSquare,
  ClipboardList,
  Gauge,
  Megaphone,
  TriangleAlert,
  Users,
} from 'lucide-react';
import { db } from '@/lib/db';
import * as t from '@/lib/db/schema';
import { requireAuth } from '@/lib/auth/context';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  PageHeader,
  Progress,
  Section,
  Stat,
} from '@/components/ui';
import { formatDate, formatTime, num, percent, pluralize, relativeTime } from '@/lib/utils';
import {
  countPendingGrading,
  dayNameOf,
  getCurrentTerm,
  getMyFacultyProfile,
  getMyOfferings,
  getMySchedule,
  getPublishedVersionId,
  toISODate,
  type ScheduleEntry,
} from './_lib/faculty';
import { NoFacultyProfile } from './_components/NoFacultyProfile';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Faculty dashboard · CampusOS' };

const WORKLOAD_TONE: Record<string, 'success' | 'warning' | 'danger' | 'info'> = {
  BALANCED: 'success',
  HIGH: 'warning',
  CRITICAL: 'danger',
  UNDERLOADED: 'info',
};

export default async function FacultyDashboard() {
  const user = await requireAuth();

  if (!user.facultyProfileId) {
    return (
      <div>
        <PageHeader title={`Good day, ${user.firstName}`} />
        <NoFacultyProfile what="The faculty dashboard" />
      </div>
    );
  }

  const now = new Date();
  const todayISO = toISODate(now);
  const today = dayNameOf(now);

  const [term, profile] = await Promise.all([
    getCurrentTerm(user.institutionId),
    getMyFacultyProfile(user),
  ]);

  const offerings = await getMyOfferings(user, term?.id ?? null);
  const offeringIds = offerings.map((o) => o.id);

  const versionId = term ? await getPublishedVersionId(user.institutionId, term.id) : null;
  const schedule = versionId ? await getMySchedule(user, versionId) : [];
  const todaysEntries = schedule
    .filter((e) => e.dayOfWeek === today)
    .sort((a, b) => a.position - b.position);

  const [
    pendingGrading,
    todaysSessions,
    exceptionsToday,
    upcomingAssignments,
    workload,
    unacknowledged,
    leaveRequests,
    atRisk,
    riskCount,
  ] = await Promise.all([
    countPendingGrading(user, offeringIds),
    offeringIds.length
      ? db
          .select({
            id: t.attendanceSessions.id,
            offeringId: t.attendanceSessions.offeringId,
            entryId: t.attendanceSessions.timetableEntryId,
            status: t.attendanceSessions.status,
            presentCount: t.attendanceSessions.presentCount,
            totalCount: t.attendanceSessions.totalCount,
          })
          .from(t.attendanceSessions)
          .where(
            and(
              eq(t.attendanceSessions.institutionId, user.institutionId),
              inArray(t.attendanceSessions.offeringId, offeringIds),
              eq(t.attendanceSessions.date, todayISO),
            ),
          )
      : [],
    offeringIds.length
      ? db
          .select({
            entryId: t.scheduleExceptions.entryId,
            kind: t.scheduleExceptions.kind,
            reason: t.scheduleExceptions.reason,
            newRoomCode: t.rooms.code,
          })
          .from(t.scheduleExceptions)
          .leftJoin(t.rooms, eq(t.rooms.id, t.scheduleExceptions.newRoomId))
          .where(
            and(
              eq(t.scheduleExceptions.institutionId, user.institutionId),
              inArray(t.scheduleExceptions.offeringId, offeringIds),
              gte(t.scheduleExceptions.date, new Date(`${todayISO}T00:00:00.000Z`)),
              lte(t.scheduleExceptions.date, new Date(`${todayISO}T23:59:59.999Z`)),
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
            maxScore: t.assignments.maxScore,
            submitted: sql<number>`(
              select count(*)::int from ${t.submissions} s
              where s.assignment_id = ${t.assignments.id}
                and s.status <> 'NOT_SUBMITTED'
            )`,
            expected: sql<number>`(
              select count(*)::int from ${t.submissions} s
              where s.assignment_id = ${t.assignments.id}
            )`,
          })
          .from(t.assignments)
          .where(
            and(
              eq(t.assignments.institutionId, user.institutionId),
              inArray(t.assignments.offeringId, offeringIds),
              eq(t.assignments.status, 'PUBLISHED'),
              isNull(t.assignments.deletedAt),
              gte(t.assignments.dueAt, now),
            ),
          )
          .orderBy(asc(t.assignments.dueAt))
          .limit(4)
      : [],
    term
      ? db
          .select()
          .from(t.workloadSummaries)
          .where(
            and(
              eq(t.workloadSummaries.institutionId, user.institutionId),
              eq(t.workloadSummaries.facultyId, user.facultyProfileId),
              eq(t.workloadSummaries.termId, term.id),
            ),
          )
          .limit(1)
      : [],
    db
      .select({
        id: t.announcements.id,
        reference: t.announcements.reference,
        title: t.announcements.title,
        priority: t.announcements.priority,
        category: t.announcements.category,
        deadline: t.announcements.acknowledgementDeadline,
        publishedAt: t.announcements.publishedAt,
      })
      .from(t.announcementRecipients)
      .innerJoin(t.announcements, eq(t.announcements.id, t.announcementRecipients.announcementId))
      .where(
        and(
          eq(t.announcementRecipients.userId, user.userId),
          isNull(t.announcementRecipients.acknowledgedAt),
          eq(t.announcements.requiresAcknowledgement, true),
          eq(t.announcements.status, 'PUBLISHED'),
        ),
      )
      .orderBy(desc(t.announcements.publishedAt))
      .limit(4),
    db
      .select({
        id: t.leaveRequests.id,
        reference: t.leaveRequests.reference,
        leaveType: t.leaveRequests.leaveType,
        fromDate: t.leaveRequests.fromDate,
        toDate: t.leaveRequests.toDate,
        status: t.leaveRequests.status,
        affectedClassCount: t.leaveRequests.affectedClassCount,
        reviewedAt: t.leaveRequests.reviewedAt,
      })
      .from(t.leaveRequests)
      .where(
        and(
          eq(t.leaveRequests.institutionId, user.institutionId),
          eq(t.leaveRequests.requesterId, user.userId),
        ),
      )
      .orderBy(desc(t.leaveRequests.createdAt))
      .limit(3),
    offeringIds.length
      ? db
          .select({
            studentId: t.studentProfiles.id,
            firstName: t.users.firstName,
            lastName: t.users.lastName,
            rollNumber: t.studentProfiles.rollNumber,
            percentageBp: t.attendanceSummaries.percentageBp,
            held: t.attendanceSummaries.heldSessions,
            attended: t.attendanceSummaries.attendedSessions,
            headroom: t.attendanceSummaries.absenceHeadroom,
            offeringId: t.attendanceSummaries.offeringId,
          })
          .from(t.attendanceSummaries)
          .innerJoin(
            t.studentProfiles,
            eq(t.studentProfiles.id, t.attendanceSummaries.studentId),
          )
          .innerJoin(t.users, eq(t.users.id, t.studentProfiles.userId))
          .where(
            and(
              eq(t.attendanceSummaries.institutionId, user.institutionId),
              inArray(t.attendanceSummaries.offeringId, offeringIds),
              eq(t.attendanceSummaries.isBelowThreshold, true),
            ),
          )
          .orderBy(asc(t.attendanceSummaries.percentageBp))
          .limit(6)
      : [],
    offeringIds.length
      ? db
          .select({ value: sql<number>`count(*)::int` })
          .from(t.attendanceSummaries)
          .where(
            and(
              eq(t.attendanceSummaries.institutionId, user.institutionId),
              inArray(t.attendanceSummaries.offeringId, offeringIds),
              eq(t.attendanceSummaries.isBelowThreshold, true),
            ),
          )
      : [],
  ]);

  const offeringById = new Map(offerings.map((o) => [o.id, o]));
  const sessionByEntry = new Map(
    todaysSessions.filter((s) => s.entryId).map((s) => [s.entryId as string, s]),
  );
  const exceptionByEntry = new Map(
    exceptionsToday.filter((e) => e.entryId).map((e) => [e.entryId as string, e]),
  );

  const summary = workload[0];
  const totalHours = summary ? Number(summary.totalHours) : null;
  const contracted = profile?.maxWeeklyTeachingHours ?? null;
  const deptAverage = summary?.departmentAverage ? Number(summary.departmentAverage) : null;
  const totalAtRisk = riskCount[0]?.value ?? 0;

  const markedToday = todaysEntries.filter((e) => sessionByEntry.get(e.entryId)?.status === 'SUBMITTED' || sessionByEntry.get(e.entryId)?.status === 'LOCKED').length;

  return (
    <div>
      <PageHeader
        title={`Good day, ${user.firstName}`}
        description={
          term
            ? `${term.name} · ${formatDate(now)} · ${offerings.length ? pluralize(offerings.length, 'class') : 'no classes allocated'}`
            : 'No academic term is marked current, so schedule and workload data cannot be shown.'
        }
        action={
          <Button asChild variant="primary" icon={CheckSquare}>
            <Link href="/faculty/attendance">Mark attendance</Link>
          </Button>
        }
      />

      {!term ? (
        <Alert tone="warning" icon={TriangleAlert} title="No current term" className="mb-5">
          Your institution has not marked an academic term as current. Schedule, workload and class
          pages need one. Ask the academic office to set the current term.
        </Alert>
      ) : null}

      {term && !versionId ? (
        <Alert tone="warning" icon={TriangleAlert} title="No published timetable" className="mb-5">
          {term.name} has no published timetable version, so today&rsquo;s classes cannot be listed.
          Attendance can still be marked against a class directly.
        </Alert>
      ) : null}

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="Classes today"
          value={todaysEntries.length}
          icon={CalendarClock}
          sublabel={
            todaysEntries.length
              ? `${markedToday} of ${todaysEntries.length} attendance taken`
              : 'Nothing scheduled'
          }
        />
        <Stat
          label="Awaiting grading"
          value={pendingGrading}
          icon={ClipboardList}
          tone={pendingGrading > 0 ? 'warning' : 'neutral'}
          sublabel="Submitted, late or resubmitted"
        />
        <Stat
          label="Weekly load"
          value={totalHours === null ? '—' : `${num(totalHours)} h`}
          icon={Gauge}
          tone={summary ? WORKLOAD_TONE[summary.status] ?? 'neutral' : 'neutral'}
          sublabel={
            contracted !== null && totalHours !== null
              ? `Contracted max ${contracted} h`
              : 'No workload summary recorded'
          }
        />
        <Stat
          label="Attendance risk"
          value={totalAtRisk}
          icon={AlertTriangle}
          tone={totalAtRisk > 0 ? 'danger' : 'success'}
          sublabel="Students below the required minimum"
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Section title="Today's classes">
            <Card>
              {todaysEntries.length === 0 ? (
                <EmptyState
                  icon={CalendarClock}
                  title={`No classes scheduled for ${today.charAt(0) + today.slice(1).toLowerCase()}`}
                  description="Your published timetable has no periods on this day."
                  action={
                    <Button asChild variant="secondary">
                      <Link href="/faculty/schedule">View the full week</Link>
                    </Button>
                  }
                />
              ) : (
                <ul className="divide-y divide-[hsl(var(--border))]">
                  {todaysEntries.map((entry) => (
                    <TodayRow
                      key={entry.entryId}
                      entry={entry}
                      session={sessionByEntry.get(entry.entryId) ?? null}
                      exception={exceptionByEntry.get(entry.entryId) ?? null}
                      sectionLabel={
                        offeringById.get(entry.offeringId)?.sectionCode ?? entry.sectionCode
                      }
                      todayISO={todayISO}
                    />
                  ))}
                </ul>
              )}
            </Card>
          </Section>

          <Section title="Upcoming assignment deadlines">
            <Card>
              {upcomingAssignments.length === 0 ? (
                <EmptyState
                  icon={ClipboardList}
                  title="No assignment deadlines ahead"
                  description="Published assignments with a future due date appear here."
                  action={
                    <Button asChild variant="secondary">
                      <Link href="/faculty/assignments/new">Create an assignment</Link>
                    </Button>
                  }
                />
              ) : (
                <ul className="divide-y divide-[hsl(var(--border))]">
                  {upcomingAssignments.map((a) => {
                    const offering = offeringById.get(a.offeringId);
                    return (
                      <li key={a.id} className="px-5 py-3.5">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="min-w-0">
                            <Link
                              href={`/faculty/assignments/${a.id}`}
                              className="text-[13.5px] font-medium text-default hover:text-brand"
                            >
                              {a.title}
                            </Link>
                            <p className="mt-0.5 text-[12.5px] text-muted">
                              {offering
                                ? `${offering.subjectCode} · ${offering.sectionCode}`
                                : 'Class no longer active'}{' '}
                              · due {formatDate(a.dueAt)} ({relativeTime(a.dueAt)})
                            </p>
                          </div>
                          <Badge tone={a.submitted >= a.expected ? 'success' : 'neutral'}>
                            {a.submitted}/{a.expected} in
                          </Badge>
                        </div>
                        <Progress
                          className="mt-2"
                          value={a.expected === 0 ? 0 : (a.submitted / a.expected) * 100}
                          tone={a.submitted >= a.expected ? 'success' : 'brand'}
                        />
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
          </Section>

          <Section
            title="Students at attendance risk"
            description={
              totalAtRisk > atRisk.length
                ? `Showing the ${atRisk.length} lowest of ${totalAtRisk}.`
                : undefined
            }
          >
            <Card>
              {atRisk.length === 0 ? (
                <EmptyState
                  icon={Users}
                  title="No student is below the attendance threshold"
                  description="Based on the recorded attendance summaries for your classes."
                />
              ) : (
                <ul className="divide-y divide-[hsl(var(--border))]">
                  {atRisk.map((s) => {
                    const offering = offeringById.get(s.offeringId);
                    return (
                      <li
                        key={`${s.studentId}-${s.offeringId}`}
                        className="flex flex-wrap items-center justify-between gap-3 px-5 py-3"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-[13.5px] font-medium text-default">
                            {s.firstName} {s.lastName}
                          </p>
                          <p className="text-[12.5px] text-muted">
                            {s.rollNumber} · {offering?.sectionCode ?? '—'} ·{' '}
                            {s.attended}/{s.held} attended
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge tone="danger">{percent(s.percentageBp)}</Badge>
                          <Link
                            href={`/faculty/classes/${s.offeringId}`}
                            className="text-[12.5px] text-brand hover:underline"
                          >
                            Open roster
                          </Link>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
          </Section>
        </div>

        <div>
          <Section title="Needs your acknowledgement">
            <Card>
              {unacknowledged.length === 0 ? (
                <EmptyState
                  icon={Megaphone}
                  title="Nothing to acknowledge"
                  description="Notices requiring your confirmation appear here."
                />
              ) : (
                <ul className="divide-y divide-[hsl(var(--border))]">
                  {unacknowledged.map((a) => (
                    <li key={a.id} className="px-5 py-3">
                      <div className="flex items-start gap-2">
                        <Badge
                          tone={
                            a.priority === 'CRITICAL'
                              ? 'danger'
                              : a.priority === 'IMPORTANT'
                                ? 'warning'
                                : 'neutral'
                          }
                        >
                          {a.priority.toLowerCase()}
                        </Badge>
                      </div>
                      <p className="mt-1.5 text-[13.5px] font-medium leading-snug text-default">
                        {a.title}
                      </p>
                      <p className="mt-0.5 text-[12.5px] text-subtle">
                        {a.reference}
                        {a.deadline ? ` · acknowledge by ${formatDate(a.deadline)}` : ''}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
              <div className="border-t border-[hsl(var(--border))] px-5 py-3">
                <Button asChild variant="secondary" size="sm" className="w-full">
                  <Link href="/faculty/announcements">Open announcements</Link>
                </Button>
              </div>
            </Card>
          </Section>

          <Section title="Workload">
            <Card>
              <CardBody>
                {summary && totalHours !== null ? (
                  <>
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="tabular text-2xl font-semibold text-default">
                        {num(totalHours)} h
                        <span className="ml-1 text-[13px] font-normal text-muted">/ week</span>
                      </p>
                      <Badge tone={WORKLOAD_TONE[summary.status] ?? 'neutral'} dot>
                        {summary.status.toLowerCase()}
                      </Badge>
                    </div>
                    {contracted !== null ? (
                      <Progress
                        className="mt-3"
                        value={totalHours}
                        max={contracted}
                        tone={totalHours > contracted ? 'danger' : 'brand'}
                        showLabel
                      />
                    ) : null}
                    <dl className="mt-3 space-y-1.5 text-[12.5px]">
                      <div className="flex justify-between">
                        <dt className="text-muted">Contracted maximum</dt>
                        <dd className="tabular text-default">
                          {contracted === null ? '—' : `${contracted} h`}
                        </dd>
                      </div>
                      <div className="flex justify-between">
                        <dt className="text-muted">Department average</dt>
                        <dd className="tabular text-default">
                          {deptAverage === null ? '—' : `${num(deptAverage)} h`}
                        </dd>
                      </div>
                      <div className="flex justify-between">
                        <dt className="text-muted">Utilisation</dt>
                        <dd className="tabular text-default">
                          {summary.utilizationPercentage
                            ? `${num(summary.utilizationPercentage)}%`
                            : '—'}
                        </dd>
                      </div>
                    </dl>
                    <p className="mt-2 text-[11.5px] text-subtle">
                      Recomputed {relativeTime(summary.recomputedAt)}.
                    </p>
                  </>
                ) : (
                  <p className="text-[13px] text-muted">
                    No workload summary has been computed for you in this term, so no total can be
                    shown.
                  </p>
                )}
              </CardBody>
              <div className="border-t border-[hsl(var(--border))] px-5 py-3">
                <Button asChild variant="secondary" size="sm" className="w-full">
                  <Link href="/faculty/workload">See the breakdown</Link>
                </Button>
              </div>
            </Card>
          </Section>

          <Section title="Leave">
            <Card>
              {leaveRequests.length === 0 ? (
                <EmptyState
                  icon={CalendarClock}
                  title="No leave requests"
                  description="Your requests and their approval status appear here."
                />
              ) : (
                <ul className="divide-y divide-[hsl(var(--border))]">
                  {leaveRequests.map((l) => (
                    <li key={l.id} className="px-5 py-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-[13px] font-medium text-default">
                          {formatDate(l.fromDate, false)}
                          {l.fromDate === l.toDate ? '' : ` – ${formatDate(l.toDate, false)}`}
                        </p>
                        <Badge
                          tone={
                            l.status === 'APPROVED'
                              ? 'success'
                              : l.status === 'REJECTED'
                                ? 'danger'
                                : l.status === 'PENDING'
                                  ? 'warning'
                                  : 'neutral'
                          }
                        >
                          {l.status.toLowerCase()}
                        </Badge>
                      </div>
                      <p className="mt-0.5 text-[12.5px] text-muted">
                        {l.reference} · {l.leaveType.toLowerCase()} ·{' '}
                        {pluralize(l.affectedClassCount, 'class')} affected
                      </p>
                    </li>
                  ))}
                </ul>
              )}
              <div className="border-t border-[hsl(var(--border))] px-5 py-3">
                <Button asChild variant="secondary" size="sm" className="w-full">
                  <Link href="/faculty/leave">Request leave</Link>
                </Button>
              </div>
            </Card>
          </Section>
        </div>
      </div>
    </div>
  );
}

function TodayRow({
  entry,
  session,
  exception,
  sectionLabel,
  todayISO,
}: {
  entry: ScheduleEntry;
  session: { id: string; status: string; presentCount: number; totalCount: number } | null;
  exception: { kind: string; reason: string; newRoomCode: string | null } | null;
  sectionLabel: string;
  todayISO: string;
}) {
  const cancelled = entry.isCancelled || exception?.kind === 'CANCELLED';
  const taken = session?.status === 'SUBMITTED' || session?.status === 'LOCKED';

  return (
    <li className="flex flex-wrap items-center gap-3 px-5 py-3.5">
      <div className="w-[92px] shrink-0">
        <p className="tabular text-[13.5px] font-semibold text-default">
          {formatTime(entry.startTime)}
        </p>
        <p className="tabular text-[11.5px] text-subtle">{formatTime(entry.endTime)}</p>
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13.5px] font-medium text-default">
          {entry.subjectCode} {entry.subjectName}
        </p>
        <p className="text-[12.5px] text-muted">
          {sectionLabel} · Room {exception?.newRoomCode ?? entry.roomCode ?? 'not allocated'}
          {entry.roomBuilding && !exception?.newRoomCode ? `, ${entry.roomBuilding}` : ''}
        </p>
        {exception ? (
          <p className="mt-1 text-[12px] text-warning">
            {exception.kind.replace(/_/g, ' ').toLowerCase()} — {exception.reason}
          </p>
        ) : null}
      </div>
      <div className="flex items-center gap-2">
        {cancelled ? (
          <Badge tone="danger">Cancelled</Badge>
        ) : taken ? (
          <Badge tone="success" dot>
            {session?.presentCount}/{session?.totalCount} present
          </Badge>
        ) : (
          <Button asChild size="sm" variant="primary">
            <Link
              href={`/faculty/attendance?offering=${entry.offeringId}&date=${todayISO}&entry=${entry.entryId}`}
            >
              Take attendance
            </Link>
          </Button>
        )}
      </div>
    </li>
  );
}
