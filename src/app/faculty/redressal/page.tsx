import Link from 'next/link';
import { and, desc, eq, inArray, or } from 'drizzle-orm';
import { LifeBuoy, Plus } from 'lucide-react';
import { db } from '@/lib/db';
import * as t from '@/lib/db/schema';
import { requirePermission } from '@/lib/auth/context';
import { GRIEVANCE_STATUS_TONE } from '../_lib/faculty';
import { isEnabled } from '@/lib/features';
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  PageHeader,
  Section,
  Stat,
} from '@/components/ui';
import { formatDate, humanize, relativeTime } from '@/lib/utils';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Redressal · CampusOS' };

const OPEN_STATES = [
  'SUBMITTED',
  'ACKNOWLEDGED',
  'ASSIGNED',
  'UNDER_REVIEW',
  'AWAITING_INFORMATION',
  'REOPENED',
] as const;


export default async function RedressalPage() {
  const user = await requirePermission('grievance:view_own');

  if (!isEnabled(user.featureFlags, 'grievance_enabled')) {
    return (
      <div>
        <PageHeader title="Redressal" />
        <Alert tone="warning" title="This module is not enabled for your institution">
          The Redressal Centre is switched off in your institution&rsquo;s settings.
        </Alert>
      </div>
    );
  }

  const cases = await db
    .select({
      id: t.grievances.id,
      caseNumber: t.grievances.caseNumber,
      subject: t.grievances.subject,
      status: t.grievances.status,
      urgency: t.grievances.urgency,
      createdAt: t.grievances.createdAt,
      resolutionDueAt: t.grievances.resolutionDueAt,
      isSlaBreached: t.grievances.isSlaBreached,
      resolvedAt: t.grievances.resolvedAt,
      raisedById: t.grievances.raisedById,
      assignedToId: t.grievances.assignedToId,
      categoryName: t.grievanceCategories.name,
    })
    .from(t.grievances)
    .innerJoin(t.grievanceCategories, eq(t.grievanceCategories.id, t.grievances.categoryId))
    .where(
      and(
        eq(t.grievances.institutionId, user.institutionId),
        user.permissions.has('grievance:view_assigned')
          ? or(
              eq(t.grievances.raisedById, user.userId),
              eq(t.grievances.assignedToId, user.userId),
            )
          : eq(t.grievances.raisedById, user.userId),
      ),
    )
    .orderBy(desc(t.grievances.createdAt));

  const raised = cases.filter((c) => c.raisedById === user.userId);
  const assigned = cases.filter(
    (c) => c.assignedToId === user.userId && c.raisedById !== user.userId,
  );
  const open = cases.filter((c) => (OPEN_STATES as readonly string[]).includes(c.status));
  const breached = cases.filter((c) => c.isSlaBreached);

  return (
    <div>
      <PageHeader
        title="Redressal"
        description="Raise an issue and track it to resolution, with a deadline attached to every stage."
        action={
          <Button asChild variant="primary" icon={Plus}>
            <Link href="/faculty/redressal/new">Raise a case</Link>
          </Button>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Your cases" value={raised.length} icon={LifeBuoy} />
        <Stat label="Open" value={open.length} tone={open.length > 0 ? 'warning' : 'success'} />
        <Stat label="Assigned to you" value={assigned.length} />
        <Stat
          label="Past their deadline"
          value={breached.length}
          tone={breached.length > 0 ? 'danger' : 'success'}
        />
      </div>

      <Section title="Cases you raised">
        <Card>
          {raised.length === 0 ? (
            <EmptyState
              icon={LifeBuoy}
              title="You have not raised any cases"
              description="Timetable clashes, room facilities, IT problems, workload and wellbeing all have a route here."
              action={
                <Button asChild variant="primary">
                  <Link href="/faculty/redressal/new">Raise a case</Link>
                </Button>
              }
            />
          ) : (
            <ul className="divide-y divide-[hsl(var(--border))]">
              {raised.map((c) => (
                <CaseRow key={c.id} c={c} />
              ))}
            </ul>
          )}
        </Card>
      </Section>

      {assigned.length > 0 ? (
        <Section
          title="Cases assigned to you"
          description="Issues routed to you to handle."
        >
          <Card>
            <ul className="divide-y divide-[hsl(var(--border))]">
              {assigned.map((c) => (
                <CaseRow key={c.id} c={c} />
              ))}
            </ul>
          </Card>
        </Section>
      ) : null}
    </div>
  );
}

function CaseRow({
  c,
}: {
  c: {
    id: string;
    caseNumber: string;
    subject: string;
    status: string;
    urgency: string;
    createdAt: Date;
    resolutionDueAt: Date | null;
    isSlaBreached: boolean;
    categoryName: string;
  };
}) {
  return (
    <li className="flex flex-wrap items-start justify-between gap-3 px-5 py-3.5">
      <div className="min-w-0">
        <Link
          href={`/faculty/redressal/${c.id}`}
          className="text-[13.5px] font-medium text-default hover:text-brand"
        >
          {c.subject}
        </Link>
        <p className="mt-0.5 text-[12.5px] text-muted">
          {c.caseNumber} · {c.categoryName} · raised {relativeTime(c.createdAt)}
          {c.resolutionDueAt ? ` · due ${formatDate(c.resolutionDueAt)}` : ''}
        </p>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-1.5">
        {c.isSlaBreached ? <Badge tone="danger">past deadline</Badge> : null}
        <Badge tone={c.urgency === 'CRITICAL' || c.urgency === 'HIGH' ? 'warning' : 'outline'}>
          {c.urgency.toLowerCase()}
        </Badge>
        <Badge tone={GRIEVANCE_STATUS_TONE[c.status] ?? 'neutral'} dot>
          {humanize(c.status)}
        </Badge>
      </div>
    </li>
  );
}
