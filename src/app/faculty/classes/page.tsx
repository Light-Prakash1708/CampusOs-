import Link from 'next/link';
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { ArrowRight, ClipboardList, Users } from 'lucide-react';
import { db } from '@/lib/db';
import * as t from '@/lib/db/schema';
import { requireAuth } from '@/lib/auth/context';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  PageHeader,
  Progress,
  Section,
  Stat,
} from '@/components/ui';
import { percent, pluralize } from '@/lib/utils';
import { getCurrentTerm, getMyOfferings } from '../_lib/faculty';
import { NoFacultyProfile } from '../_components/NoFacultyProfile';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'My classes · CampusOS' };

export default async function ClassesPage() {
  const user = await requireAuth();

  if (!user.facultyProfileId) {
    return (
      <div>
        <PageHeader title="My classes" />
        <NoFacultyProfile what="Your class list" />
      </div>
    );
  }

  const term = await getCurrentTerm(user.institutionId);
  const offerings = await getMyOfferings(user, term?.id ?? null);
  const offeringIds = offerings.map((o) => o.id);

  const [enrolCounts, attendance, grading] = await Promise.all([
    offeringIds.length
      ? db
          .select({
            offeringId: t.enrollments.offeringId,
            students: sql<number>`count(*)::int`,
          })
          .from(t.enrollments)
          .where(
            and(
              eq(t.enrollments.institutionId, user.institutionId),
              inArray(t.enrollments.offeringId, offeringIds),
              isNull(t.enrollments.droppedAt),
            ),
          )
          .groupBy(t.enrollments.offeringId)
      : [],
    offeringIds.length
      ? db
          .select({
            offeringId: t.attendanceSummaries.offeringId,
            averageBp: sql<number>`coalesce(round(avg(${t.attendanceSummaries.percentageBp}))::int, 0)`,
            atRisk: sql<number>`count(*) filter (where ${t.attendanceSummaries.isBelowThreshold})::int`,
            tracked: sql<number>`count(*)::int`,
          })
          .from(t.attendanceSummaries)
          .where(
            and(
              eq(t.attendanceSummaries.institutionId, user.institutionId),
              inArray(t.attendanceSummaries.offeringId, offeringIds),
            ),
          )
          .groupBy(t.attendanceSummaries.offeringId)
      : [],
    offeringIds.length
      ? db
          .select({
            offeringId: t.assignments.offeringId,
            pending: sql<number>`count(*) filter (where ${t.submissions.status} in ('SUBMITTED','LATE','RESUBMITTED'))::int`,
            assignments: sql<number>`count(distinct ${t.assignments.id})::int`,
          })
          .from(t.assignments)
          .leftJoin(t.submissions, eq(t.submissions.assignmentId, t.assignments.id))
          .where(
            and(
              eq(t.assignments.institutionId, user.institutionId),
              inArray(t.assignments.offeringId, offeringIds),
              isNull(t.assignments.deletedAt),
            ),
          )
          .groupBy(t.assignments.offeringId)
      : [],
  ]);

  const enrolBy = new Map(enrolCounts.map((r) => [r.offeringId, r.students]));
  const attBy = new Map(attendance.map((r) => [r.offeringId, r]));
  const gradeBy = new Map(grading.map((r) => [r.offeringId, r]));

  const totalStudents = enrolCounts.reduce((sum, r) => sum + r.students, 0);
  const totalPending = grading.reduce((sum, r) => sum + r.pending, 0);
  const totalAtRisk = attendance.reduce((sum, r) => sum + r.atRisk, 0);

  return (
    <div>
      <PageHeader
        title="My classes"
        description={
          term
            ? `${term.name} · ${pluralize(offerings.length, 'class')}`
            : 'No current academic term is set.'
        }
      />

      {offerings.length === 0 ? (
        <Card>
          <EmptyState
            icon={Users}
            title="No classes are allocated to you this term"
            description="A class is a subject taught to a section in a term. The academic office creates these allocations."
          />
        </Card>
      ) : (
        <>
          <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Classes" value={offerings.length} icon={Users} />
            <Stat label="Students taught" value={totalStudents} icon={Users} />
            <Stat
              label="Awaiting grading"
              value={totalPending}
              icon={ClipboardList}
              tone={totalPending > 0 ? 'warning' : 'neutral'}
            />
            <Stat
              label="Below attendance minimum"
              value={totalAtRisk}
              tone={totalAtRisk > 0 ? 'danger' : 'success'}
            />
          </div>

          <Section title="Class list">
            <div className="grid gap-4 md:grid-cols-2">
              {offerings.map((offering) => {
                const att = attBy.get(offering.id);
                const grade = gradeBy.get(offering.id);
                const students = enrolBy.get(offering.id) ?? 0;
                const avgBp = att?.averageBp ?? null;
                const minBp = Math.round(Number(offering.minAttendancePercentage) * 100);
                return (
                  <Card key={offering.id} className="flex flex-col">
                    <div className="flex items-start justify-between gap-3 border-b border-[hsl(var(--border))] px-5 py-4">
                      <div className="min-w-0">
                        <p className="text-[15px] font-semibold text-default">
                          {offering.subjectCode} {offering.subjectName}
                        </p>
                        <p className="mt-0.5 text-[13px] text-muted">
                          {offering.sectionCode} · {offering.programName}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <Badge tone="outline">{offering.subjectKind.toLowerCase()}</Badge>
                        {!offering.isPrimaryTeacher ? (
                          <Badge tone="info">co-teacher</Badge>
                        ) : null}
                      </div>
                    </div>

                    <div className="flex-1 px-5 py-4">
                      <dl className="grid grid-cols-3 gap-3 text-center">
                        <div>
                          <dt className="text-[11.5px] text-muted">Students</dt>
                          <dd className="tabular mt-0.5 text-lg font-semibold text-default">
                            {students}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-[11.5px] text-muted">Attendance</dt>
                          <dd
                            className={`tabular mt-0.5 text-lg font-semibold ${
                              avgBp !== null && avgBp < minBp ? 'text-danger' : 'text-default'
                            }`}
                          >
                            {avgBp === null ? '—' : percent(avgBp)}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-[11.5px] text-muted">To grade</dt>
                          <dd
                            className={`tabular mt-0.5 text-lg font-semibold ${
                              (grade?.pending ?? 0) > 0 ? 'text-warning' : 'text-default'
                            }`}
                          >
                            {grade?.pending ?? 0}
                          </dd>
                        </div>
                      </dl>

                      {avgBp !== null ? (
                        <>
                          <Progress
                            className="mt-3"
                            value={avgBp / 100}
                            tone={avgBp < minBp ? 'danger' : 'success'}
                          />
                          <p className="mt-1.5 text-[12px] text-subtle">
                            Class average across {att?.tracked ?? 0} tracked students · minimum
                            required {offering.minAttendancePercentage}% ·{' '}
                            <span className={att && att.atRisk > 0 ? 'text-danger' : undefined}>
                              {att?.atRisk ?? 0} below
                            </span>
                          </p>
                        </>
                      ) : (
                        <p className="mt-3 text-[12px] text-subtle">
                          No attendance has been recorded for this class yet.
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-2 border-t border-[hsl(var(--border))] bg-surface-muted px-5 py-3">
                      <Button asChild size="sm" variant="primary" iconRight={ArrowRight}>
                        <Link href={`/faculty/classes/${offering.id}`}>Open roster</Link>
                      </Button>
                      <Button asChild size="sm" variant="secondary">
                        <Link href={`/faculty/attendance?offering=${offering.id}`}>
                          Take attendance
                        </Link>
                      </Button>
                    </div>
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
