import Link from 'next/link';
import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { ClipboardList, Plus, Sparkles } from 'lucide-react';
import { db } from '@/lib/db';
import * as t from '@/lib/db/schema';
import { requirePermission } from '@/lib/auth/context';
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
import { formatDate, humanize, num, pluralize, relativeTime } from '@/lib/utils';
import { getCurrentTerm, getMyOfferings } from '../_lib/faculty';
import { NoFacultyProfile } from '../_components/NoFacultyProfile';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Assignments · CampusOS' };

export default async function AssignmentsPage() {
  const user = await requirePermission('assignment:create');

  if (!user.facultyProfileId) {
    return (
      <div>
        <PageHeader title="Assignments" />
        <NoFacultyProfile what="Your assignments" />
      </div>
    );
  }

  const term = await getCurrentTerm(user.institutionId);
  const offerings = await getMyOfferings(user, term?.id ?? null);
  const offeringIds = offerings.map((o) => o.id);
  const offeringById = new Map(offerings.map((o) => [o.id, o]));

  const assignments = offeringIds.length
    ? await db
        .select({
          id: t.assignments.id,
          title: t.assignments.title,
          status: t.assignments.status,
          dueAt: t.assignments.dueAt,
          maxScore: t.assignments.maxScore,
          offeringId: t.assignments.offeringId,
          createdAt: t.assignments.createdAt,
          skillTags: t.assignments.skillTags,
          expected: sql<number>`(select count(*)::int from ${t.submissions} s where s.assignment_id = ${t.assignments.id})`,
          submitted: sql<number>`(select count(*)::int from ${t.submissions} s where s.assignment_id = ${t.assignments.id} and s.status <> 'NOT_SUBMITTED')`,
          pending: sql<number>`(select count(*)::int from ${t.submissions} s where s.assignment_id = ${t.assignments.id} and s.status in ('SUBMITTED','LATE','RESUBMITTED'))`,
          evaluated: sql<number>`(select count(*)::int from ${t.submissions} s where s.assignment_id = ${t.assignments.id} and s.status in ('EVALUATED','RETURNED'))`,
          aiUnreviewed: sql<number>`(select count(*)::int from ${t.submissions} s where s.assignment_id = ${t.assignments.id} and s.ai_suggested_score is not null and s.ai_suggestion_reviewed = false)`,
        })
        .from(t.assignments)
        .where(
          and(
            eq(t.assignments.institutionId, user.institutionId),
            inArray(t.assignments.offeringId, offeringIds),
            isNull(t.assignments.deletedAt),
          ),
        )
        .orderBy(desc(t.assignments.createdAt))
    : [];

  const totalPending = assignments.reduce((s, a) => s + a.pending, 0);
  const totalAi = assignments.reduce((s, a) => s + a.aiUnreviewed, 0);
  const drafts = assignments.filter((a) => a.status === 'DRAFT').length;

  return (
    <div>
      <PageHeader
        title="Assignments"
        description={
          term
            ? `${term.name} · ${pluralize(assignments.length, 'assignment')} across ${pluralize(offerings.length, 'class')}`
            : 'No current academic term is set.'
        }
        action={
          <Button asChild variant="primary" icon={Plus}>
            <Link href="/faculty/assignments/new">New assignment</Link>
          </Button>
        }
      />

      {assignments.length === 0 ? (
        <Card>
          <EmptyState
            icon={ClipboardList}
            title="You have not created any assignments"
            description={
              offerings.length === 0
                ? 'An assignment belongs to a class, and you have no classes allocated this term.'
                : 'Create one with a rubric and a deadline, and every enrolled student gets a submission slot.'
            }
            action={
              offerings.length > 0 ? (
                <Button asChild variant="primary" icon={Plus}>
                  <Link href="/faculty/assignments/new">New assignment</Link>
                </Button>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <>
          <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Assignments" value={assignments.length} icon={ClipboardList} />
            <Stat
              label="Awaiting grading"
              value={totalPending}
              tone={totalPending > 0 ? 'warning' : 'neutral'}
            />
            <Stat label="Drafts" value={drafts} sublabel="Not visible to students" />
            <Stat
              label="AI suggestions to review"
              value={totalAi}
              icon={Sparkles}
              tone={totalAi > 0 ? 'info' : 'neutral'}
              sublabel="Never applied automatically"
            />
          </div>

          <Section title="All assignments">
            <Card>
              <ul className="divide-y divide-[hsl(var(--border))]">
                {assignments.map((a) => {
                  const offering = offeringById.get(a.offeringId);
                  const overdue = a.dueAt ? new Date(a.dueAt) < new Date() : false;
                  return (
                    <li key={a.id} className="px-5 py-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <Link
                            href={`/faculty/assignments/${a.id}`}
                            className="text-[14px] font-medium text-default hover:text-brand"
                          >
                            {a.title}
                          </Link>
                          <p className="mt-0.5 text-[12.5px] text-muted">
                            {offering
                              ? `${offering.subjectCode} · ${offering.sectionCode}`
                              : 'Class no longer active'}{' '}
                            · out of {num(a.maxScore)} ·{' '}
                            {a.dueAt
                              ? `${overdue ? 'closed' : 'due'} ${formatDate(a.dueAt)} (${relativeTime(a.dueAt)})`
                              : 'no due date'}
                          </p>
                          {(a.skillTags ?? []).length > 0 ? (
                            <div className="mt-1.5 flex flex-wrap gap-1">
                              {(a.skillTags ?? []).map((tag) => (
                                <Badge key={tag} tone="outline">
                                  {tag}
                                </Badge>
                              ))}
                            </div>
                          ) : null}
                        </div>
                        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                          <Badge
                            tone={
                              a.status === 'PUBLISHED'
                                ? 'success'
                                : a.status === 'DRAFT'
                                  ? 'neutral'
                                  : 'outline'
                            }
                          >
                            {humanize(a.status)}
                          </Badge>
                          {a.pending > 0 ? (
                            <Badge tone="warning">{a.pending} to grade</Badge>
                          ) : null}
                          {a.aiUnreviewed > 0 ? (
                            <Badge tone="info" icon={Sparkles}>
                              {a.aiUnreviewed} AI suggestion
                              {a.aiUnreviewed === 1 ? '' : 's'}
                            </Badge>
                          ) : null}
                        </div>
                      </div>

                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        <div>
                          <div className="flex justify-between text-[12px] text-muted">
                            <span>Submitted</span>
                            <span className="tabular">
                              {a.submitted}/{a.expected}
                            </span>
                          </div>
                          <Progress
                            className="mt-1"
                            value={a.expected === 0 ? 0 : (a.submitted / a.expected) * 100}
                          />
                        </div>
                        <div>
                          <div className="flex justify-between text-[12px] text-muted">
                            <span>Graded</span>
                            <span className="tabular">
                              {a.evaluated}/{a.submitted}
                            </span>
                          </div>
                          <Progress
                            className="mt-1"
                            value={a.submitted === 0 ? 0 : (a.evaluated / a.submitted) * 100}
                            tone={a.evaluated === a.submitted ? 'success' : 'warning'}
                          />
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </Card>
          </Section>
        </>
      )}
    </div>
  );
}
