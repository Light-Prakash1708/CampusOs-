import { ShieldCheck } from 'lucide-react';
import { requireAnyPermission } from '@/lib/auth/context';
import { Card, CardBody, CardHeader, EmptyState, PageHeader } from '@/components/ui';
import { getPendingApprovals } from '../_lib/admin';
import { ApprovalList } from './ApprovalList';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Approvals · CampusOS' };

export default async function ApprovalsPage() {
  const user = await requireAnyPermission([
    'timetable:approve_change',
    'announcement:approve',
    'leave:approve',
  ]);

  const approvals = await getPendingApprovals(user.institutionId, user.userId);

  return (
    <div>
      <PageHeader
        title="Approvals"
        description="Requests waiting on your decision. Each shows its impact before you decide."
      />

      {approvals.length === 0 ? (
        <Card>
          <EmptyState
            icon={ShieldCheck}
            title="Nothing waiting on you"
            description="Leave requests, notice publications and schedule changes that need approval appear here."
          />
        </Card>
      ) : (
        <ApprovalList
          approvals={approvals.map((a) => ({
            id: a.id,
            kind: a.kind,
            title: a.title,
            description: a.description,
            impactSummary: a.impactSummary as Record<string, unknown> | null,
            createdAt: a.createdAt.toISOString(),
            requester: a.requesterFirst
              ? `${a.requesterFirst} ${a.requesterLast ?? ''}`.trim()
              : 'System',
          }))}
        />
      )}
    </div>
  );
}
