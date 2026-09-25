import Link from 'next/link';
import {
  AlarmClock,
  CheckCircle2,
  ClipboardList,
  FileText,
  GraduationCap,
  Paperclip,
} from 'lucide-react';
import {
  Badge,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  PageHeader,
  Progress,
  Section,
  type BadgeTone,
} from '@/components/ui';
import { formatDate, formatDateTime, humanize, num, pluralize, relativeTime } from '@/lib/utils';

import { requireStudentContext } from '../_lib/auth';
import { getStudentAssignments, type StudentAssignment } from '../_lib/coursework';
import { AskAiLink, ProseBody, SubjectTag } from '../_components/bits';

export const metadata = { title: 'Assignments' };
export const dynamic = 'force-dynamic';

export default async function AssignmentsPage() {
  const user = await requireStudentContext('assignment:submit');
  const assignments = await getStudentAssignments(user.institutionId, user.studentProfileId);

  const overdue = assignments
    .filter((a) => a.bucket === 'OVERDUE')
    .sort((a, b) => (a.dueAt?.getTime() ?? 0) - (b.dueAt?.getTime() ?? 0));
  const dueSoon = assignments
    .filter((a) => a.bucket === 'DUE_SOON')
    .sort((a, b) => (a.dueAt?.getTime() ?? 0) - (b.dueAt?.getTime() ?? 0));
  const submitted = assignments
    .filter((a) => a.bucket === 'SUBMITTED')
    .sort((a, b) => (b.submission?.submittedAt?.getTime() ?? 0) - (a.submission?.submittedAt?.getTime() ?? 0));
  const evaluated = assignments
    .filter((a) => a.bucket === 'EVALUATED')
    .sort((a, b) => (b.submission?.evaluatedAt?.getTime() ?? 0) - (a.submission?.evaluatedAt?.getTime() ?? 0));

  return (
    <>
      <PageHeader
        title="Assignments"
        description={
          assignments.length > 0
            ? `${pluralize(assignments.length, 'assignment')} across your subjects this term.`
            : undefined
        }
        action={<AskAiLink question="What assignments do I have due this week?" />}
      />

      {assignments.length === 0 ? (
        <Card>
          <CardBody className="p-0">
            <EmptyState
              icon={ClipboardList}
              title="No assignments have been set"
              description="Nothing has been published for the subjects you are enrolled in. Draft assignments your faculty are still preparing are not shown."
            />
          </CardBody>
        </Card>
      ) : (
        <div className="space-y-7">
          <Group
            title="Overdue"
            icon={AlarmClock}
            tone="danger"
            items={overdue}
            emptyTitle="Nothing overdue"
            emptyDescription="Every assignment past its due date has been handed in."
          />
          <Group
            title="Due soon"
            icon={ClipboardList}
            tone="warning"
            items={dueSoon}
            emptyTitle="Nothing waiting to be handed in"
            emptyDescription="You have submitted everything that has been set so far."
          />
          <Group
            title="Submitted · awaiting evaluation"
            icon={CheckCircle2}
            tone="info"
            items={submitted}
            emptyTitle="Nothing awaiting evaluation"
            emptyDescription="Submissions appear here until your faculty records a score."
          />
          <Group
            title="Evaluated"
            icon={GraduationCap}
            tone="success"
            items={evaluated}
            emptyTitle="No results yet"
            emptyDescription="Scores appear here once faculty have evaluated and returned your work."
          />
        </div>
      )}
    </>
  );
}

function Group({
  title,
  icon,
  tone,
  items,
  emptyTitle,
  emptyDescription,
}: {
  title: string;
  icon: typeof ClipboardList;
  tone: BadgeTone;
  items: StudentAssignment[];
  emptyTitle: string;
  emptyDescription: string;
}) {
  return (
    <Section
      title={title}
      action={
        <Badge tone={items.length === 0 ? 'neutral' : tone} className="tabular">
          {items.length}
        </Badge>
      }
    >
      {items.length === 0 ? (
        <Card>
          <CardBody className="p-0">
            <EmptyState icon={icon} title={emptyTitle} description={emptyDescription} />
          </CardBody>
        </Card>
      ) : (
        <div className="space-y-3">
          {items.map((assignment) => (
            <AssignmentCard key={assignment.id} assignment={assignment} />
          ))}
        </div>
      )}
    </Section>
  );
}

function AssignmentCard({ assignment }: { assignment: StudentAssignment }) {
  const submission = assignment.submission;
  const scored = assignment.bucket === 'EVALUATED' && submission?.score != null;
  const scorePct = scored
    ? (Number(submission?.score) / Math.max(1, Number(assignment.maxScore))) * 100
    : null;
  const deadlineMoved =
    assignment.originalDueAt &&
    assignment.dueAt &&
    assignment.originalDueAt.getTime() !== assignment.dueAt.getTime();

  return (
    <Card>
      <CardHeader
        title={assignment.title}
        description={`${assignment.subjectName}${assignment.facultyName ? ` · ${assignment.facultyName}` : ''}`}
        action={
          scored ? (
            <div className="text-right">
              <p className="tabular text-lg font-semibold text-default">
                {num(submission?.score, 2)}
                <span className="text-[13px] font-normal text-subtle">
                  {' '}
                  / {num(assignment.maxScore, 0)}
                </span>
              </p>
              <p className="text-[11.5px] text-subtle">
                {scorePct !== null ? `${Math.round(scorePct)}%` : ''}
              </p>
            </div>
          ) : (
            <Badge tone={statusTone(assignment)}>{statusLabel(assignment)}</Badge>
          )
        }
      >
        <div className="mt-1.5">
          <SubjectTag code={assignment.subjectCode} />
        </div>
      </CardHeader>

      <CardBody className="space-y-3">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[12.5px] text-muted">
          <span>
            {assignment.dueAt ? (
              <>
                Due <span className="text-default">{formatDateTime(assignment.dueAt)}</span>
                {Math.abs(assignment.dueAt.getTime() - Date.now()) < 7 * 86_400_000 ? <> · {relativeTime(assignment.dueAt)}</> : null}
              </>
            ) : (
              'No due date set'
            )}
          </span>
          <span>
            Worth <span className="text-default">{num(assignment.maxScore, 0)} marks</span>
            {assignment.weightPercentage
              ? ` · ${num(assignment.weightPercentage)}% of the subject`
              : ''}
          </span>
          {assignment.attachmentCount > 0 ? (
            <span className="inline-flex items-center gap-1">
              <Paperclip size={12} className="text-subtle" aria-hidden />
              {pluralize(assignment.attachmentCount, 'attachment')}
            </span>
          ) : null}
        </div>

        {deadlineMoved ? (
          <p className="rounded-md bg-info-subtle px-3 py-2 text-[12.5px] text-default">
            The deadline moved from {formatDate(assignment.originalDueAt)} to{' '}
            {formatDate(assignment.dueAt)}. The change is recorded in your change feed.
          </p>
        ) : null}

        {assignment.bucket === 'OVERDUE' ? (
          <p className="rounded-md bg-danger-subtle px-3 py-2 text-[12.5px] text-default">
            {assignment.allowLateSubmission
              ? 'Past the due date. Late submission is still allowed for this assignment — a late penalty may apply.'
              : 'Past the due date and late submission is not allowed for this assignment. Speak to your faculty, or raise a case if there were circumstances outside your control.'}
          </p>
        ) : null}

        {submission ? (
          <div className="rounded-lg border border-[hsl(var(--border))] bg-surface-muted p-3">
            <p className="text-[12px] font-semibold uppercase tracking-wide text-subtle">
              Your submission
            </p>
            <p className="mt-1 text-[12.5px] text-muted">
              {humanize(submission.status)}
              {submission.submittedAt ? ` · ${formatDate(submission.submittedAt)}` : ''}
              {submission.attemptNumber > 1 ? ` · attempt ${submission.attemptNumber}` : ''}
              {submission.evaluatedAt ? ` · evaluated ${formatDate(submission.evaluatedAt)}` : ''}
            </p>
            {scored && scorePct !== null ? (
              <Progress
                className="mt-2"
                value={scorePct}
                tone={scorePct >= 75 ? 'success' : scorePct >= 40 ? 'warning' : 'danger'}
              />
            ) : null}
            {submission.feedback ? (
              <div className="mt-2.5">
                <p className="text-[12px] font-semibold uppercase tracking-wide text-subtle">
                  Feedback
                </p>
                <ProseBody className="mt-1 text-[13px]" text={submission.feedback} />
              </div>
            ) : null}
          </div>
        ) : null}

        {assignment.instructions ? (
          <details className="group">
            <summary className="inline-flex cursor-pointer items-center gap-1.5 text-[12.5px] font-medium text-brand">
              <FileText size={13} aria-hidden />
              Instructions
            </summary>
            <ProseBody className="mt-2" text={assignment.instructions} />
          </details>
        ) : null}

        <div className="flex flex-wrap items-center gap-4 pt-0.5">
          <AskAiLink
            question={`What do I need to do for the assignment "${assignment.title}" in ${assignment.subjectCode}?`}
          />
          {assignment.bucket === 'EVALUATED' ? (
            <Link
              href={`/student/redressal/new?category=academic&subject=${encodeURIComponent(assignment.subjectCode)}`}
              className="text-[12.5px] font-medium text-muted hover:text-default hover:underline"
            >
              Query this evaluation
            </Link>
          ) : null}
        </div>
      </CardBody>
    </Card>
  );
}

function statusTone(assignment: StudentAssignment): BadgeTone {
  switch (assignment.bucket) {
    case 'OVERDUE':
      return 'danger';
    case 'SUBMITTED':
      return 'info';
    case 'EVALUATED':
      return 'success';
    default:
      return 'neutral';
  }
}

function statusLabel(assignment: StudentAssignment): string {
  if (assignment.bucket === 'OVERDUE') return 'Overdue';
  if (assignment.bucket === 'SUBMITTED') return humanize(assignment.submission?.status ?? '');
  if (assignment.bucket === 'EVALUATED') return 'Evaluated';
  return 'Not submitted';
}
