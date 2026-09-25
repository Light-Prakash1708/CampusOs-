import { and, desc, eq } from 'drizzle-orm';
import { FileText } from 'lucide-react';
import { db } from '@/lib/db';
import * as t from '@/lib/db/schema';
import { requirePermission } from '@/lib/auth/context';
import {
  Alert,
  Badge,
  Card,
  EmptyState,
  PageHeader,
  Section,
} from '@/components/ui';
import { formatDate, humanize, pluralize, relativeTime } from '@/lib/utils';
import { getCurrentTerm, isISODate, toISODate } from '../_lib/faculty';
import { NoFacultyProfile } from '../_components/NoFacultyProfile';
import { LeaveRequestForm } from './LeaveRequestForm';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Leave · CampusOS' };

const STATUS_TONE: Record<string, 'success' | 'warning' | 'danger' | 'neutral'> = {
  APPROVED: 'success',
  PENDING: 'warning',
  REJECTED: 'danger',
  CANCELLED: 'neutral',
  DRAFT: 'neutral',
};

export default async function LeavePage({
  searchParams,
}: {
  searchParams: Promise<{ entry?: string; date?: string }>;
}) {
  const user = await requirePermission('leave:request');
  const params = await searchParams;

  if (!user.facultyProfileId) {
    return (
      <div>
        <PageHeader title="Leave" />
        <NoFacultyProfile what="Leave requests" />
      </div>
    );
  }

  const today = toISODate(new Date());
  const term = await getCurrentTerm(user.institutionId);
  const defaultFrom = isISODate(params.date) && params.date >= today ? params.date : today;

  const [requests, approvals] = await Promise.all([
    db
      .select()
      .from(t.leaveRequests)
      .where(
        and(
          eq(t.leaveRequests.institutionId, user.institutionId),
          eq(t.leaveRequests.requesterId, user.userId),
        ),
      )
      .orderBy(desc(t.leaveRequests.createdAt)),
    db
      .select({
        entityId: t.approvals.entityId,
        status: t.approvals.status,
        decidedAt: t.approvals.decidedAt,
        decisionNote: t.approvals.decisionNote,
      })
      .from(t.approvals)
      .where(
        and(
          eq(t.approvals.institutionId, user.institutionId),
          eq(t.approvals.kind, 'LEAVE_REQUEST'),
          eq(t.approvals.requestedById, user.userId),
        ),
      ),
  ]);

  const approvalByLeave = new Map(
    approvals.filter((a) => a.entityId).map((a) => [a.entityId as string, a]),
  );

  return (
    <div>
      <PageHeader
        title="Leave"
        description="Requesting leave shows you exactly which classes it affects before anything is submitted."
      />

      {params.entry ? (
        <Alert tone="info" title="Requesting cover for a specific class" className="mb-5">
          You came here from your schedule. The dates below are pre-filled for that class, and it is
          highlighted in the impact list once you check it. CampusOS does not reassign the class
          itself — your head of department arranges cover when they approve the request.
        </Alert>
      ) : null}

      <Section title="New request">
        <LeaveRequestForm
          defaultFrom={defaultFrom}
          highlightEntryId={params.entry ?? null}
          minDate={term?.startDate && term.startDate > today ? term.startDate : today}
        />
      </Section>

      <Section title="Your requests" description={`${pluralize(requests.length, 'request')} on record.`}>
        <Card>
          {requests.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="You have not requested leave"
              description="Requests you submit, and their approval status, appear here."
            />
          ) : (
            <ul className="divide-y divide-[hsl(var(--border))]">
              {requests.map((r) => {
                const approval = approvalByLeave.get(r.id);
                return (
                  <li key={r.id} className="px-5 py-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[13.5px] font-medium text-default">
                          {formatDate(r.fromDate)}
                          {r.fromDate === r.toDate ? '' : ` – ${formatDate(r.toDate)}`}
                          {r.isHalfDay ? ' (half day)' : ''}
                        </p>
                        <p className="mt-0.5 text-[12.5px] text-muted">
                          {r.reference} · {humanize(r.leaveType)} · requested{' '}
                          {relativeTime(r.createdAt)} ·{' '}
                          {pluralize(r.affectedClassCount, 'class')} needing cover
                        </p>
                        <p className="mt-1.5 text-[13px] leading-relaxed text-default">
                          {r.reason}
                        </p>
                        {r.reviewNote ? (
                          <p className="mt-1.5 text-[12.5px] text-muted">
                            Reviewer&rsquo;s note: {r.reviewNote}
                          </p>
                        ) : null}
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <Badge tone={STATUS_TONE[r.status] ?? 'neutral'} dot>
                          {humanize(r.status)}
                        </Badge>
                        {r.reviewedAt ? (
                          <span className="text-[12px] text-subtle">
                            decided {formatDate(r.reviewedAt)}
                          </span>
                        ) : approval ? (
                          <span className="text-[12px] text-subtle">
                            approval task {approval.status.toLowerCase()}
                          </span>
                        ) : (
                          <span className="text-[12px] text-warning">
                            no approval task found
                          </span>
                        )}
                      </div>
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
