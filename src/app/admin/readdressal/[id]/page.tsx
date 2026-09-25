import Link from 'next/link';
import { ArrowLeft, ShieldAlert } from 'lucide-react';
import { requireAnyPermission } from '@/lib/auth/context';
import { Alert, Badge, Card, CardBody, CardHeader, PageHeader } from '@/components/ui';
import { formatDateTime, humanize, relativeTime } from '@/lib/utils';
import { getGrievance } from '@/services/grievance';
import { getAssignableStaff } from '../../_lib/admin';
import { CaseWorkbench } from './CaseWorkbench';

export const dynamic = 'force-dynamic';

export default async function CaseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireAnyPermission(['grievance:view_all', 'grievance:view_assigned']);
  const { id } = await params;

  const detail = await getGrievance(user, id);
  const staff = await getAssignableStaff(user.institutionId);

  return (
    <div>
      <PageHeader
        title={detail.subject}
        description={`${detail.caseNumber} · ${detail.category}`}
        breadcrumb={
          <Link
            href="/admin/readdressal"
            className="inline-flex items-center gap-1 text-[12.5px] text-muted hover:text-default"
          >
            <ArrowLeft size={13} /> Readdressal
          </Link>
        }
      />

      {detail.isAnonymous ? (
        <Alert tone="info" icon={ShieldAlert} className="mb-4" title="Anonymous case">
          {detail.raisedByName === null
            ? 'The identity of the person who raised this is deliberately withheld from case handlers. Handle it on its merits.'
            : 'You are viewing the identity on an anonymous case. This access has been recorded in the audit log.'}
        </Alert>
      ) : null}

      {detail.isSlaBreached ? (
        <Alert tone="danger" className="mb-4" title="Past the resolution deadline">
          This case has escalated automatically to the next authority. Escalation level{' '}
          {detail.escalationLevel}.
        </Alert>
      ) : null}

      <CaseWorkbench
        detail={{
          ...detail,
          createdAt: detail.createdAt.toISOString(),
          responseDueAt: detail.responseDueAt?.toISOString() ?? null,
          resolutionDueAt: detail.resolutionDueAt?.toISOString() ?? null,
          resolvedAt: detail.resolvedAt?.toISOString() ?? null,
          messages: detail.messages.map((m) => ({ ...m, createdAt: m.createdAt.toISOString() })),
          timeline: detail.timeline.map((e) => ({ ...e, createdAt: e.createdAt.toISOString() })),
        }}
        canAssign={user.permissions.has('grievance:assign')}
        canResolve={user.permissions.has('grievance:resolve')}
        staff={staff.map((s) => ({
          id: s.id,
          name: `${s.firstName} ${s.lastName}`,
          role: s.role,
          departmentCode: s.departmentCode,
        }))}
      />
    </div>
  );
}
