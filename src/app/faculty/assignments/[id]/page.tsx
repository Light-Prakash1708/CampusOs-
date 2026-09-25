import Link from 'next/link';
import { notFound } from 'next/navigation';
import { and, asc, eq, isNull, or } from 'drizzle-orm';
import { ClipboardList, Sparkles } from 'lucide-react';
import { db } from '@/lib/db';
import * as t from '@/lib/db/schema';
import { requirePermission } from '@/lib/auth/context';
import {
  Alert,
  Badge,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  PageHeader,
  Progress,
  Section,
  Stat,
} from '@/components/ui';
import { formatDateTime, humanize, num, pluralize } from '@/lib/utils';
import { AssignmentActions } from './AssignmentActions';
import { GradeRow, type GradeRowSubmission, type RubricCriterion } from './GradeRow';

export const dynamic = 'force-dynamic';

const PENDING = ['SUBMITTED', 'LATE', 'RESUBMITTED'];

export default async function AssignmentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requirePermission('assignment:create');
  const { id } = await params;

  if (!user.facultyProfileId) notFound();

  const [assignment] = await db
    .select({
      id: t.assignments.id,
      title: t.assignments.title,
      instructions: t.assignments.instructions,
      status: t.assignments.status,
      maxScore: t.assignments.maxScore,
      dueAt: t.assignments.dueAt,
      originalDueAt: t.assignments.originalDueAt,
      allowLateSubmission: t.assignments.allowLateSubmission,
      rubric: t.assignments.rubric,
      skillTags: t.assignments.skillTags,
      publishedAt: t.assignments.publishedAt,
      offeringId: t.assignments.offeringId,
      subjectCode: t.subjects.code,
      subjectName: t.subjects.name,
      sectionCode: t.sections.code,
    })
    .from(t.assignments)
    .innerJoin(t.courseOfferings, eq(t.courseOfferings.id, t.assignments.offeringId))
    .innerJoin(t.subjects, eq(t.subjects.id, t.courseOfferings.subjectId))
    .innerJoin(t.sections, eq(t.sections.id, t.courseOfferings.sectionId))
    .where(
      and(
        eq(t.assignments.id, id),
        eq(t.assignments.institutionId, user.institutionId),
        isNull(t.assignments.deletedAt),
        or(
          eq(t.courseOfferings.facultyId, user.facultyProfileId),
          eq(t.courseOfferings.secondaryFacultyId, user.facultyProfileId),
        ),
      ),
    )
    .limit(1);

  if (!assignment) notFound();

  const submissions = await db
    .select({
      id: t.submissions.id,
      status: t.submissions.status,
      submittedAt: t.submissions.submittedAt,
      content: t.submissions.content,
      attachments: t.submissions.attachments,
      score: t.submissions.score,
      feedback: t.submissions.feedback,
      aiSuggestedScore: t.submissions.aiSuggestedScore,
      aiFeedback: t.submissions.aiFeedback,
      aiRubricScores: t.submissions.aiRubricScores,
      aiSuggestionReviewed: t.submissions.aiSuggestionReviewed,
      similarityScore: t.submissions.similarityScore,
      similarityNotes: t.submissions.similarityNotes,
      firstName: t.users.firstName,
      lastName: t.users.lastName,
      rollNumber: t.studentProfiles.rollNumber,
      avatarUrl: t.users.avatarUrl,
    })
    .from(t.submissions)
    .innerJoin(t.studentProfiles, eq(t.studentProfiles.id, t.submissions.studentId))
    .innerJoin(t.users, eq(t.users.id, t.studentProfiles.userId))
    .where(
      and(
        eq(t.submissions.assignmentId, assignment.id),
        eq(t.submissions.institutionId, user.institutionId),
      ),
    )
    .orderBy(asc(t.studentProfiles.rollNumber));

  const rubric = (assignment.rubric ?? []) as RubricCriterion[];
  const maxScore = Number(assignment.maxScore);

  const expected = submissions.length;
  const submitted = submissions.filter((s) => s.status !== 'NOT_SUBMITTED').length;
  const pending = submissions.filter((s) => PENDING.includes(s.status)).length;
  const graded = submissions.filter((s) => s.score !== null).length;
  const aiPending = submissions.filter(
    (s) => s.aiSuggestedScore !== null && !s.aiSuggestionReviewed,
  ).length;

  const scored = submissions.filter((s) => s.score !== null).map((s) => Number(s.score));
  const average =
    scored.length > 0 ? scored.reduce((a, b) => a + b, 0) / scored.length : null;

  const rows: GradeRowSubmission[] = submissions.map((s) => ({
    id: s.id,
    studentName: `${s.firstName} ${s.lastName}`,
    rollNumber: s.rollNumber,
    avatarUrl: s.avatarUrl,
    status: s.status,
    submittedAt: s.submittedAt ? s.submittedAt.toISOString() : null,
    content: s.content,
    attachmentCount: (s.attachments ?? []).length,
    score: s.score,
    feedback: s.feedback,
    aiSuggestedScore: s.aiSuggestedScore,
    aiFeedback: s.aiFeedback,
    aiRubricScores: s.aiRubricScores as Record<string, number> | null,
    aiSuggestionReviewed: s.aiSuggestionReviewed,
    similarityScore: s.similarityScore,
    similarityNotes: s.similarityNotes,
  }));

  // Ungraded work first — that is what the marker came here to do.
  const ordered = [
    ...rows.filter((r) => PENDING.includes(r.status) && r.score === null),
    ...rows.filter((r) => !(PENDING.includes(r.status) && r.score === null)),
  ];

  return (
    <div>
      <PageHeader
        breadcrumb={
          <Link href="/faculty/assignments" className="text-[12.5px] text-muted hover:text-brand">
            ← Assignments
          </Link>
        }
        title={assignment.title}
        description={`${assignment.subjectCode} ${assignment.subjectName} · ${assignment.sectionCode} · out of ${num(maxScore)}${
          assignment.dueAt ? ` · due ${formatDateTime(assignment.dueAt)}` : ' · no deadline'
        }`}
        action={<AssignmentActions id={assignment.id} status={assignment.status} />}
      />

      <div className="mb-5 flex flex-wrap items-center gap-1.5">
        <Badge tone={assignment.status === 'PUBLISHED' ? 'success' : 'neutral'}>
          {humanize(assignment.status)}
        </Badge>
        {assignment.allowLateSubmission ? (
          <Badge tone="outline">late submissions accepted</Badge>
        ) : (
          <Badge tone="outline">no late submissions</Badge>
        )}
        {(assignment.skillTags ?? []).map((tag) => (
          <Badge key={tag} tone="brand">
            {tag}
          </Badge>
        ))}
      </div>

      {assignment.originalDueAt ? (
        <Alert tone="info" className="mb-5" title="The deadline was changed">
          Originally due {formatDateTime(assignment.originalDueAt)}, now{' '}
          {formatDateTime(assignment.dueAt)}. Students were notified through the change feed.
        </Alert>
      ) : null}

      {assignment.status === 'DRAFT' ? (
        <Alert tone="warning" className="mb-5" title="This is a draft">
          No student can see this assignment and no submission slots exist yet. Publishing creates
          one slot per enrolled student.
        </Alert>
      ) : null}

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="Submitted"
          value={`${submitted}/${expected}`}
          icon={ClipboardList}
          sublabel={expected === 0 ? 'No slots yet' : undefined}
        />
        <Stat
          label="Awaiting grading"
          value={pending}
          tone={pending > 0 ? 'warning' : 'success'}
        />
        <Stat
          label="Average score"
          value={average === null ? '—' : `${num(average)}`}
          sublabel={
            average === null
              ? 'No score recorded yet'
              : `From ${pluralize(scored.length, 'graded submission')}`
          }
        />
        <Stat
          label="AI suggestions pending"
          value={aiPending}
          icon={Sparkles}
          tone={aiPending > 0 ? 'info' : 'neutral'}
          sublabel="Require an explicit decision"
        />
      </div>

      {expected > 0 ? (
        <div className="mb-6 grid gap-4 sm:grid-cols-2">
          <Card>
            <CardBody>
              <div className="flex justify-between text-[12.5px] text-muted">
                <span>Submission rate</span>
                <span className="tabular">
                  {submitted}/{expected}
                </span>
              </div>
              <Progress className="mt-2" value={(submitted / expected) * 100} />
            </CardBody>
          </Card>
          <Card>
            <CardBody>
              <div className="flex justify-between text-[12.5px] text-muted">
                <span>Grading progress</span>
                <span className="tabular">
                  {graded}/{submitted}
                </span>
              </div>
              <Progress
                className="mt-2"
                value={submitted === 0 ? 0 : (graded / submitted) * 100}
                tone={graded === submitted && submitted > 0 ? 'success' : 'warning'}
              />
            </CardBody>
          </Card>
        </div>
      ) : null}

      {assignment.instructions ? (
        <Section title="Instructions">
          <Card>
            <CardBody>
              <p className="whitespace-pre-wrap text-[13.5px] leading-relaxed text-default">
                {assignment.instructions}
              </p>
            </CardBody>
          </Card>
        </Section>
      ) : null}

      {rubric.length > 0 ? (
        <Section title="Rubric">
          <Card>
            <ul className="divide-y divide-[hsl(var(--border))]">
              {rubric.map((r) => (
                <li key={r.criterion} className="flex items-start justify-between gap-3 px-5 py-3">
                  <div>
                    <p className="text-[13.5px] font-medium text-default">{r.criterion}</p>
                    {r.descriptor ? (
                      <p className="text-[12.5px] text-muted">{r.descriptor}</p>
                    ) : null}
                  </div>
                  <span className="tabular text-[13px] text-default">{r.maxScore}</span>
                </li>
              ))}
            </ul>
          </Card>
        </Section>
      ) : null}

      <Section
        title="Submissions"
        description={
          aiPending > 0
            ? 'An AI-suggested score is never the recorded score until you accept it.'
            : undefined
        }
      >
        <Card>
          {ordered.length === 0 ? (
            <EmptyState
              icon={ClipboardList}
              title="No submission slots exist yet"
              description={
                assignment.status === 'DRAFT'
                  ? 'Publish the assignment to create a slot for every enrolled student.'
                  : 'No students are enrolled in this class.'
              }
            />
          ) : (
            <ul className="divide-y divide-[hsl(var(--border))]">
              {ordered.map((s) => (
                <GradeRow key={s.id} submission={s} maxScore={maxScore} rubric={rubric} />
              ))}
            </ul>
          )}
        </Card>
      </Section>
    </div>
  );
}
