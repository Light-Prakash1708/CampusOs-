import Link from 'next/link';
import { notFound } from 'next/navigation';
import { and, asc, desc, eq, isNull, or, sql } from 'drizzle-orm';
import { CheckSquare, ClipboardList, Users } from 'lucide-react';
import { db } from '@/lib/db';
import * as t from '@/lib/db/schema';
import { requireAuth } from '@/lib/auth/context';
import {
  Avatar,
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  PageHeader,
  Section,
  Stat,
  Table,
  Td,
  Th,
} from '@/components/ui';
import { formatDate, humanize, num, percent, pluralize } from '@/lib/utils';

export const dynamic = 'force-dynamic';

const PENDING = ['SUBMITTED', 'LATE', 'RESUBMITTED'] as const;

export default async function ClassRosterPage({
  params,
}: {
  params: Promise<{ offeringId: string }>;
}) {
  const user = await requireAuth();
  const { offeringId } = await params;

  if (!user.facultyProfileId) notFound();

  const [offering] = await db
    .select({
      id: t.courseOfferings.id,
      subjectCode: t.subjects.code,
      subjectName: t.subjects.name,
      subjectKind: t.subjects.kind,
      credits: t.subjects.credits,
      sectionCode: t.sections.code,
      sectionName: t.sections.name,
      programName: t.programs.name,
      termName: t.terms.name,
      minAttendancePercentage: t.courseOfferings.minAttendancePercentage,
    })
    .from(t.courseOfferings)
    .innerJoin(t.subjects, eq(t.subjects.id, t.courseOfferings.subjectId))
    .innerJoin(t.sections, eq(t.sections.id, t.courseOfferings.sectionId))
    .innerJoin(t.programs, eq(t.programs.id, t.sections.programId))
    .innerJoin(t.terms, eq(t.terms.id, t.courseOfferings.termId))
    .where(
      and(
        eq(t.courseOfferings.id, offeringId),
        eq(t.courseOfferings.institutionId, user.institutionId),
        or(
          eq(t.courseOfferings.facultyId, user.facultyProfileId),
          eq(t.courseOfferings.secondaryFacultyId, user.facultyProfileId),
        ),
      ),
    )
    .limit(1);

  // A class the caller does not teach is indistinguishable from one that does
  // not exist — we do not confirm the existence of other people's records.
  if (!offering) notFound();

  const [roster, assignments, sessionCount] = await Promise.all([
    db
      .select({
        studentId: t.studentProfiles.id,
        firstName: t.users.firstName,
        lastName: t.users.lastName,
        rollNumber: t.studentProfiles.rollNumber,
        avatarUrl: t.users.avatarUrl,
        currentYear: t.studentProfiles.currentYear,
        percentageBp: t.attendanceSummaries.percentageBp,
        held: t.attendanceSummaries.heldSessions,
        attended: t.attendanceSummaries.attendedSessions,
        headroom: t.attendanceSummaries.absenceHeadroom,
        isBelowThreshold: t.attendanceSummaries.isBelowThreshold,
      })
      .from(t.enrollments)
      .innerJoin(t.studentProfiles, eq(t.studentProfiles.id, t.enrollments.studentId))
      .innerJoin(t.users, eq(t.users.id, t.studentProfiles.userId))
      .leftJoin(
        t.attendanceSummaries,
        and(
          eq(t.attendanceSummaries.studentId, t.studentProfiles.id),
          eq(t.attendanceSummaries.offeringId, offeringId),
        ),
      )
      .where(
        and(
          eq(t.enrollments.institutionId, user.institutionId),
          eq(t.enrollments.offeringId, offeringId),
          isNull(t.enrollments.droppedAt),
        ),
      )
      .orderBy(asc(t.studentProfiles.rollNumber)),
    db
      .select({
        id: t.assignments.id,
        title: t.assignments.title,
        status: t.assignments.status,
        dueAt: t.assignments.dueAt,
        maxScore: t.assignments.maxScore,
      })
      .from(t.assignments)
      .where(
        and(
          eq(t.assignments.institutionId, user.institutionId),
          eq(t.assignments.offeringId, offeringId),
          isNull(t.assignments.deletedAt),
        ),
      )
      .orderBy(desc(t.assignments.dueAt)),
    db
      .select({ value: sql<number>`count(*)::int` })
      .from(t.attendanceSessions)
      .where(
        and(
          eq(t.attendanceSessions.institutionId, user.institutionId),
          eq(t.attendanceSessions.offeringId, offeringId),
        ),
      ),
  ]);

  const assignmentIds = assignments.map((a) => a.id);
  const submissions = assignmentIds.length
    ? await db
        .select({
          assignmentId: t.submissions.assignmentId,
          studentId: t.submissions.studentId,
          status: t.submissions.status,
          score: t.submissions.score,
        })
        .from(t.submissions)
        .where(
          and(
            eq(t.submissions.institutionId, user.institutionId),
            sql`${t.submissions.assignmentId} = ANY(${assignmentIds}::uuid[])`,
          ),
        )
    : [];

  const subByStudent = new Map<
    string,
    { submitted: number; evaluated: number; pending: number; missing: number; scoreSum: number; scored: number }
  >();
  for (const student of roster) {
    subByStudent.set(student.studentId, {
      submitted: 0,
      evaluated: 0,
      pending: 0,
      missing: 0,
      scoreSum: 0,
      scored: 0,
    });
  }
  for (const s of submissions) {
    const bucket = subByStudent.get(s.studentId);
    if (!bucket) continue;
    if (s.status === 'NOT_SUBMITTED') bucket.missing += 1;
    else bucket.submitted += 1;
    if (s.status === 'EVALUATED' || s.status === 'RETURNED') bucket.evaluated += 1;
    if ((PENDING as readonly string[]).includes(s.status)) bucket.pending += 1;
    if (s.score !== null) {
      bucket.scoreSum += Number(s.score);
      bucket.scored += 1;
    }
  }

  const totalPending = submissions.filter((s) =>
    (PENDING as readonly string[]).includes(s.status),
  ).length;
  const atRisk = roster.filter((r) => r.isBelowThreshold).length;
  const tracked = roster.filter((r) => r.percentageBp !== null);
  const classAverageBp =
    tracked.length > 0
      ? Math.round(tracked.reduce((sum, r) => sum + (r.percentageBp ?? 0), 0) / tracked.length)
      : null;

  return (
    <div>
      <PageHeader
        breadcrumb={
          <Link href="/faculty/classes" className="text-[12.5px] text-muted hover:text-brand">
            ← My classes
          </Link>
        }
        title={`${offering.subjectCode} ${offering.subjectName}`}
        description={`${offering.sectionCode} · ${offering.programName} · ${offering.termName} · ${humanize(
          offering.subjectKind,
        )}, ${pluralize(offering.credits, 'credit')}`}
        action={
          <>
            <Button asChild variant="secondary" icon={CheckSquare}>
              <Link href={`/faculty/attendance?offering=${offering.id}`}>Take attendance</Link>
            </Button>
            <Button asChild variant="primary" icon={ClipboardList}>
              <Link href={`/faculty/assignments/new?offering=${offering.id}`}>New assignment</Link>
            </Button>
          </>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Enrolled" value={roster.length} icon={Users} />
        <Stat
          label="Class attendance"
          value={classAverageBp === null ? '—' : percent(classAverageBp)}
          sublabel={`Minimum ${offering.minAttendancePercentage}%`}
          tone={
            classAverageBp !== null &&
            classAverageBp < Math.round(Number(offering.minAttendancePercentage) * 100)
              ? 'danger'
              : 'success'
          }
        />
        <Stat
          label="Below minimum"
          value={atRisk}
          tone={atRisk > 0 ? 'danger' : 'success'}
          sublabel={`${sessionCount[0]?.value ?? 0} registers recorded`}
        />
        <Stat
          label="Awaiting grading"
          value={totalPending}
          tone={totalPending > 0 ? 'warning' : 'neutral'}
          sublabel={`${assignments.length} assignments`}
        />
      </div>

      <Section title="Roster" description="Attendance and assignment status per student.">
        <Card>
          {roster.length === 0 ? (
            <EmptyState
              icon={Users}
              title="No students are enrolled"
              description="Enrolment is managed by the academic office. Once students are enrolled they appear here."
            />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Student</Th>
                  <Th align="right">Attendance</Th>
                  <Th align="right">Sessions</Th>
                  <Th align="right">Headroom</Th>
                  <Th align="right">Submitted</Th>
                  <Th align="right">Graded</Th>
                  <Th align="right">Avg score</Th>
                </tr>
              </thead>
              <tbody>
                {roster.map((student) => {
                  const bucket = subByStudent.get(student.studentId)!;
                  return (
                    <tr key={student.studentId}>
                      <Td>
                        <div className="flex items-center gap-2.5">
                          <Avatar
                            name={`${student.firstName} ${student.lastName}`}
                            src={student.avatarUrl}
                            size={30}
                          />
                          <div className="min-w-0">
                            <p className="truncate text-[13.5px] font-medium text-default">
                              {student.firstName} {student.lastName}
                            </p>
                            <p className="text-[12px] text-muted">{student.rollNumber}</p>
                          </div>
                        </div>
                      </Td>
                      <Td align="right">
                        {student.percentageBp === null ? (
                          <span className="text-[12.5px] text-subtle">not recorded</span>
                        ) : (
                          <Badge tone={student.isBelowThreshold ? 'danger' : 'success'}>
                            {percent(student.percentageBp)}
                          </Badge>
                        )}
                      </Td>
                      <Td align="right" className="tabular text-[13px]">
                        {student.held === null ? '—' : `${student.attended}/${student.held}`}
                      </Td>
                      <Td align="right" className="tabular text-[13px]">
                        {student.headroom === null ? '—' : student.headroom}
                      </Td>
                      <Td align="right" className="tabular text-[13px]">
                        {bucket.submitted}/{bucket.submitted + bucket.missing}
                      </Td>
                      <Td align="right" className="tabular text-[13px]">
                        {bucket.evaluated}
                        {bucket.pending > 0 ? (
                          <span className="ml-1 text-[12px] text-warning">
                            ({bucket.pending} to grade)
                          </span>
                        ) : null}
                      </Td>
                      <Td align="right" className="tabular text-[13px]">
                        {bucket.scored === 0 ? '—' : num(bucket.scoreSum / bucket.scored)}
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          )}
        </Card>
      </Section>

      <Section title="Assignments for this class">
        <Card>
          {assignments.length === 0 ? (
            <EmptyState
              icon={ClipboardList}
              title="No assignments yet"
              description="Assignments you create for this class appear here."
              action={
                <Button asChild variant="primary">
                  <Link href={`/faculty/assignments/new?offering=${offering.id}`}>
                    Create an assignment
                  </Link>
                </Button>
              }
            />
          ) : (
            <ul className="divide-y divide-[hsl(var(--border))]">
              {assignments.map((a) => {
                const mine = submissions.filter((s) => s.assignmentId === a.id);
                const pending = mine.filter((s) =>
                  (PENDING as readonly string[]).includes(s.status),
                ).length;
                return (
                  <li
                    key={a.id}
                    className="flex flex-wrap items-center justify-between gap-3 px-5 py-3"
                  >
                    <div className="min-w-0">
                      <Link
                        href={`/faculty/assignments/${a.id}`}
                        className="text-[13.5px] font-medium text-default hover:text-brand"
                      >
                        {a.title}
                      </Link>
                      <p className="text-[12.5px] text-muted">
                        {a.dueAt ? `Due ${formatDate(a.dueAt)}` : 'No due date'} · out of{' '}
                        {num(a.maxScore)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge tone={a.status === 'PUBLISHED' ? 'success' : 'neutral'}>
                        {humanize(a.status)}
                      </Badge>
                      {pending > 0 ? <Badge tone="warning">{pending} to grade</Badge> : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </Section>
    </div>
  );
}
