import Link from 'next/link';
import { and, asc, desc, eq, isNull } from 'drizzle-orm';
import { CalendarCheck, History, ListChecks } from 'lucide-react';
import { db } from '@/lib/db';
import * as t from '@/lib/db/schema';
import { requirePermission, can } from '@/lib/auth/context';
import {
  Alert,
  Badge,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  PageHeader,
  Section,
  Table,
  Td,
  Th,
} from '@/components/ui';
import { formatDate, humanize, percent } from '@/lib/utils';
import {
  dayNameOf,
  fromISODate,
  getCurrentTerm,
  getMyOfferings,
  getMySchedule,
  getPublishedVersionId,
  isISODate,
  toISODate,
} from '../_lib/faculty';
import { NoFacultyProfile } from '../_components/NoFacultyProfile';
import { AttendanceMarker, type RosterStudent } from './AttendanceMarker';
import { ClassPicker } from './ClassPicker';
import { CorrectionForm } from './CorrectionForm';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Attendance · CampusOS' };

export default async function AttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ offering?: string; date?: string; entry?: string; session?: string }>;
}) {
  const user = await requirePermission('attendance:mark');
  const params = await searchParams;

  if (!user.facultyProfileId) {
    return (
      <div>
        <PageHeader title="Attendance" />
        <NoFacultyProfile what="Attendance marking" />
      </div>
    );
  }

  const term = await getCurrentTerm(user.institutionId);
  const offerings = await getMyOfferings(user, term?.id ?? null);

  if (offerings.length === 0) {
    return (
      <div>
        <PageHeader
          title="Attendance"
          description={term ? term.name : 'No current academic term is set.'}
        />
        <Card>
          <EmptyState
            icon={ListChecks}
            title="You have no classes allocated this term"
            description="Attendance is taken against a class allocation. Once the academic office allocates you a subject and section, it appears here."
          />
        </Card>
      </div>
    );
  }

  const selectedOffering =
    offerings.find((o) => o.id === params.offering) ?? offerings[0]!;
  const today = toISODate(new Date());
  const date = isISODate(params.date) ? params.date : today;

  // A register can be tied to the scheduled period it came from, which is what
  // makes the (class, date, period) uniqueness meaningful for double periods.
  const versionId = term ? await getPublishedVersionId(user.institutionId, term.id) : null;
  const schedule = versionId ? await getMySchedule(user, versionId) : [];
  const dayEntries = schedule.filter(
    (e) => e.offeringId === selectedOffering.id && e.dayOfWeek === dayNameOf(fromISODate(date)),
  );
  const entryId =
    (params.entry && dayEntries.find((e) => e.entryId === params.entry)?.entryId) ??
    dayEntries[0]?.entryId ??
    null;

  const [roster, existingSession, pastSessions] = await Promise.all([
    db
      .select({
        studentId: t.studentProfiles.id,
        firstName: t.users.firstName,
        lastName: t.users.lastName,
        rollNumber: t.studentProfiles.rollNumber,
        avatarUrl: t.users.avatarUrl,
        percentageBp: t.attendanceSummaries.percentageBp,
        isBelowThreshold: t.attendanceSummaries.isBelowThreshold,
      })
      .from(t.enrollments)
      .innerJoin(t.studentProfiles, eq(t.studentProfiles.id, t.enrollments.studentId))
      .innerJoin(t.users, eq(t.users.id, t.studentProfiles.userId))
      .leftJoin(
        t.attendanceSummaries,
        and(
          eq(t.attendanceSummaries.studentId, t.studentProfiles.id),
          eq(t.attendanceSummaries.offeringId, selectedOffering.id),
        ),
      )
      .where(
        and(
          eq(t.enrollments.institutionId, user.institutionId),
          eq(t.enrollments.offeringId, selectedOffering.id),
          isNull(t.enrollments.droppedAt),
        ),
      )
      .orderBy(asc(t.studentProfiles.rollNumber)),
    db
      .select({
        id: t.attendanceSessions.id,
        status: t.attendanceSessions.status,
        presentCount: t.attendanceSessions.presentCount,
        absentCount: t.attendanceSessions.absentCount,
        totalCount: t.attendanceSessions.totalCount,
        submittedAt: t.attendanceSessions.submittedAt,
        topicCovered: t.attendanceSessions.topicCovered,
      })
      .from(t.attendanceSessions)
      .where(
        and(
          eq(t.attendanceSessions.institutionId, user.institutionId),
          eq(t.attendanceSessions.offeringId, selectedOffering.id),
          eq(t.attendanceSessions.date, date),
        ),
      )
      .limit(1),
    db
      .select({
        id: t.attendanceSessions.id,
        date: t.attendanceSessions.date,
        status: t.attendanceSessions.status,
        presentCount: t.attendanceSessions.presentCount,
        absentCount: t.attendanceSessions.absentCount,
        totalCount: t.attendanceSessions.totalCount,
        topicCovered: t.attendanceSessions.topicCovered,
      })
      .from(t.attendanceSessions)
      .where(
        and(
          eq(t.attendanceSessions.institutionId, user.institutionId),
          eq(t.attendanceSessions.offeringId, selectedOffering.id),
        ),
      )
      .orderBy(desc(t.attendanceSessions.date))
      .limit(12),
  ]);

  const session = existingSession[0] ?? null;
  const alreadySubmitted = session?.status === 'SUBMITTED' || session?.status === 'LOCKED';

  const openSessionId =
    params.session && pastSessions.some((s) => s.id === params.session) ? params.session : null;

  const openRecords = openSessionId
    ? await db
        .select({
          id: t.attendanceRecords.id,
          status: t.attendanceRecords.status,
          originalStatus: t.attendanceRecords.originalStatus,
          correctionReason: t.attendanceRecords.correctionReason,
          correctedAt: t.attendanceRecords.correctedAt,
          firstName: t.users.firstName,
          lastName: t.users.lastName,
          rollNumber: t.studentProfiles.rollNumber,
        })
        .from(t.attendanceRecords)
        .innerJoin(t.studentProfiles, eq(t.studentProfiles.id, t.attendanceRecords.studentId))
        .innerJoin(t.users, eq(t.users.id, t.studentProfiles.userId))
        .where(eq(t.attendanceRecords.sessionId, openSessionId))
        .orderBy(asc(t.studentProfiles.rollNumber))
    : [];

  const rosterProps: RosterStudent[] = roster.map((s) => ({
    studentId: s.studentId,
    name: `${s.firstName} ${s.lastName}`,
    rollNumber: s.rollNumber,
    avatarUrl: s.avatarUrl,
    percentageBp: s.percentageBp,
    isBelowThreshold: s.isBelowThreshold ?? false,
  }));

  const offeringLabel = `${selectedOffering.subjectCode} ${selectedOffering.subjectName} · ${selectedOffering.sectionCode}`;
  const canCorrect = can(user, 'attendance:correct');

  return (
    <div>
      <PageHeader
        title="Attendance"
        description={
          term
            ? `${term.name} · registers are recorded against a class and a date`
            : 'No current academic term is set.'
        }
      />

      <Card className="mb-5">
        <CardBody>
          <ClassPicker
            offerings={offerings.map((o) => ({
              id: o.id,
              label: `${o.subjectCode} ${o.subjectName} — ${o.sectionCode}`,
            }))}
            offeringId={selectedOffering.id}
            date={date}
            minDate={term?.startDate}
            maxDate={term?.endDate}
          />
          {dayEntries.length > 0 ? (
            <p className="mt-3 text-[12.5px] text-muted">
              Scheduled on this day:{' '}
              {dayEntries
                .map((e) => `${e.slotLabel} in room ${e.roomCode ?? 'not allocated'}`)
                .join(', ')}
              .
            </p>
          ) : (
            <p className="mt-3 text-[12.5px] text-muted">
              This class is not scheduled on{' '}
              {formatDate(fromISODate(date))}. You can still record a register — it will be filed as
              an unscheduled session.
            </p>
          )}
        </CardBody>
      </Card>

      {date > today ? (
        <Alert tone="warning" title="That date is in the future" className="mb-5">
          A register can only be filed for a class that has already happened. Pick today or an
          earlier date.
        </Alert>
      ) : alreadySubmitted && session ? (
        <Section title="Already submitted">
          <Card>
            <CardHeader
              title={offeringLabel}
              description={`${formatDate(fromISODate(date))} · ${session.presentCount} present, ${session.absentCount} absent of ${session.totalCount}`}
              action={<Badge tone="success">{humanize(session.status)}</Badge>}
            />
            <CardBody>
              <p className="text-[13px] text-muted">
                This register was filed
                {session.submittedAt ? ` on ${formatDate(session.submittedAt)}` : ''}. Recorded
                values can still be changed, but only as a correction with a reason — use the
                register below.
              </p>
              {session.topicCovered ? (
                <p className="mt-2 text-[13px] text-default">
                  <span className="text-subtle">Topic covered:</span> {session.topicCovered}
                </p>
              ) : null}
              <Link
                href={`/faculty/attendance?offering=${selectedOffering.id}&date=${date}&session=${session.id}`}
                className="mt-3 inline-block text-[13px] text-brand hover:underline"
              >
                Open this register to correct a record
              </Link>
            </CardBody>
          </Card>
        </Section>
      ) : (
        <Section title="Mark attendance">
          <AttendanceMarker
            offeringId={selectedOffering.id}
            offeringLabel={offeringLabel}
            date={date}
            dateLabel={formatDate(fromISODate(date))}
            timetableEntryId={entryId}
            roster={rosterProps}
            minAttendancePercentage={selectedOffering.minAttendancePercentage}
          />
        </Section>
      )}

      <Section
        title="Past registers"
        description={`The last ${pastSessions.length} sessions recorded for ${selectedOffering.subjectCode} ${selectedOffering.sectionCode}.`}
      >
        <Card>
          {pastSessions.length === 0 ? (
            <EmptyState
              icon={History}
              title="No registers recorded yet for this class"
              description="Once you submit a register it appears here, and can be corrected from here."
            />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Date</Th>
                  <Th>Status</Th>
                  <Th align="right">Present</Th>
                  <Th align="right">Absent</Th>
                  <Th align="right">Rate</Th>
                  <Th>Topic</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {pastSessions.map((s) => (
                  <tr key={s.id} className={s.id === openSessionId ? 'bg-surface-muted' : undefined}>
                    <Td>{formatDate(fromISODate(s.date))}</Td>
                    <Td>
                      <Badge
                        tone={
                          s.status === 'LOCKED'
                            ? 'neutral'
                            : s.status === 'SUBMITTED'
                              ? 'success'
                              : s.status === 'CANCELLED'
                                ? 'danger'
                                : 'outline'
                        }
                      >
                        {humanize(s.status)}
                      </Badge>
                    </Td>
                    <Td align="right" className="tabular">
                      {s.presentCount}
                    </Td>
                    <Td align="right" className="tabular">
                      {s.absentCount}
                    </Td>
                    <Td align="right" className="tabular">
                      {s.totalCount > 0
                        ? percent(Math.round((s.presentCount / s.totalCount) * 10000))
                        : '—'}
                    </Td>
                    <Td className="text-[12.5px] text-muted">{s.topicCovered ?? '—'}</Td>
                    <Td align="right">
                      <Link
                        href={
                          s.id === openSessionId
                            ? `/faculty/attendance?offering=${selectedOffering.id}&date=${date}`
                            : `/faculty/attendance?offering=${selectedOffering.id}&date=${date}&session=${s.id}`
                        }
                        className="text-[12.5px] text-brand hover:underline"
                      >
                        {s.id === openSessionId ? 'Close' : 'Open'}
                      </Link>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      </Section>

      {openSessionId ? (
        <Section
          title="Correct a record"
          description="The original value is kept, a reason is required, and the change is written to the audit log."
        >
          <Card>
            <CardHeader
              title={`Register of ${formatDate(
                fromISODate(pastSessions.find((s) => s.id === openSessionId)!.date),
              )}`}
              description={`${openRecords.length} students`}
              icon={CalendarCheck}
            />
            {!canCorrect ? (
              <CardBody>
                <Alert tone="warning" title="You cannot correct attendance">
                  Your role does not hold the <code>attendance:correct</code> capability, so these
                  records are read-only for you.
                </Alert>
              </CardBody>
            ) : null}
            <ul className="divide-y divide-[hsl(var(--border))]">
              {openRecords.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="text-[13.5px] font-medium text-default">
                      {r.firstName} {r.lastName}
                    </p>
                    <p className="text-[12px] text-muted">
                      {r.rollNumber}
                      {r.correctionReason ? ` · ${r.correctionReason}` : ''}
                    </p>
                  </div>
                  <Badge
                    tone={
                      r.status === 'PRESENT'
                        ? 'success'
                        : r.status === 'ABSENT'
                          ? 'danger'
                          : r.status === 'LATE'
                            ? 'warning'
                            : 'info'
                    }
                  >
                    {humanize(r.status)}
                  </Badge>
                  {canCorrect ? (
                    <CorrectionForm
                      recordId={r.id}
                      studentName={`${r.firstName} ${r.lastName}`}
                      currentStatus={r.status}
                      originalStatus={r.originalStatus}
                      correctionReason={r.correctionReason}
                    />
                  ) : r.originalStatus ? (
                    <Badge tone="info">corrected from {humanize(r.originalStatus)}</Badge>
                  ) : null}
                </li>
              ))}
            </ul>
          </Card>
        </Section>
      ) : null}

      <p className="mt-6 text-[12px] leading-relaxed text-subtle">
        How the percentage is computed: <strong>Present</strong> and <strong>Late</strong> count as
        attended; <strong>Absent</strong> and <strong>Medical</strong> count against the student;
        <strong> Excused</strong> is removed from the denominator entirely. Only submitted or locked
        registers are counted.
      </p>
    </div>
  );
}
