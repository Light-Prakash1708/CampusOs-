import Link from 'next/link';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { AlertTriangle, LifeBuoy, Timer } from 'lucide-react';
import { db } from '@/lib/db';
import * as t from '@/lib/db/schema';
import { requireAnyPermission } from '@/lib/auth/context';
import {
  Badge, Card, CardHeader, EmptyState, PageHeader, Section, Stat, Table, Td, Th,
} from '@/components/ui';
import { humanize, pluralize, relativeTime } from '@/lib/utils';
import { computeGrievanceHealth } from '@/services/analytics';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Redressal · CampusOS' };

const OPEN_STATES: (typeof t.grievances.$inferSelect)['status'][] = [
  'SUBMITTED', 'ACKNOWLEDGED', 'ASSIGNED', 'UNDER_REVIEW', 'AWAITING_INFORMATION', 'REOPENED',
];

const URGENCY_TONE = { CRITICAL: 'danger', HIGH: 'warning', NORMAL: 'neutral', LOW: 'info' } as const;

export default async function AdminRedressalPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const user = await requireAnyPermission(['grievance:view_all', 'grievance:view_assigned']);
  const { filter } = await searchParams;

  const viewAll = user.permissions.has('grievance:view_all');
  const now = new Date();

  const scope = viewAll
    ? eq(t.grievances.institutionId, user.institutionId)
    : and(
        eq(t.grievances.institutionId, user.institutionId),
        eq(t.grievances.assignedToId, user.userId),
      );

  const filterClause =
    filter === 'breached'
      ? eq(t.grievances.isSlaBreached, true)
      : filter === 'due'
        ? and(
            eq(t.grievances.isSlaBreached, false),
            sql`${t.grievances.resolutionDueAt} < now() + interval '24 hours'`,
            inArray(t.grievances.status, OPEN_STATES),
          )
        : filter === 'resolved'
          ? inArray(t.grievances.status, ['RESOLVED', 'CLOSED'])
          : inArray(t.grievances.status, OPEN_STATES);

  const [cases, health] = await Promise.all([
    db
      .select({
        id: t.grievances.id,
        caseNumber: t.grievances.caseNumber,
        subject: t.grievances.subject,
        status: t.grievances.status,
        urgency: t.grievances.urgency,
        isAnonymous: t.grievances.isAnonymous,
        createdAt: t.grievances.createdAt,
        resolutionDueAt: t.grievances.resolutionDueAt,
        isSlaBreached: t.grievances.isSlaBreached,
        category: t.grievanceCategories.name,
        assigneeFirst: t.users.firstName,
        assigneeLast: t.users.lastName,
      })
      .from(t.grievances)
      .innerJoin(t.grievanceCategories, eq(t.grievanceCategories.id, t.grievances.categoryId))
      .leftJoin(t.users, eq(t.users.id, t.grievances.assignedToId))
      .where(and(scope, filterClause))
      .orderBy(t.grievances.resolutionDueAt)
      .limit(120),
    computeGrievanceHealth(user.institutionId),
  ]);

  const filters = [
    { key: 'open', label: 'Open', count: health.open },
    { key: 'due', label: 'Due soon', count: health.approachingSla },
    { key: 'breached', label: 'Past SLA', count: health.breached },
    { key: 'resolved', label: 'Resolved', count: health.resolvedLast30Days },
  ];

  return (
    <div>
      <PageHeader
        title="Redressal centre"
        description="Structured issue resolution. Nothing here can be deleted, and every deadline escalates automatically."
      />

      <Section title="Case health">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Open cases" value={health.open} icon={LifeBuoy} />
          <Stat
            label="Past resolution deadline"
            value={health.breached}
            icon={AlertTriangle}
            tone={health.breached > 0 ? 'danger' : 'success'}
          />
          <Stat
            label="Due within 24 hours"
            value={health.approachingSla}
            icon={Timer}
            tone={health.approachingSla > 0 ? 'warning' : 'neutral'}
          />
          <Stat
            label="Average resolution"
            value={health.averageResolutionHours !== null ? `${health.averageResolutionHours} hrs` : '—'}
            sublabel={`${health.resolvedLast30Days} resolved in 30 days`}
          />
        </div>
      </Section>

      <div className="mb-4 flex flex-wrap gap-1.5">
        {filters.map((f) => {
          const active = (filter ?? 'open') === f.key;
          return (
            <Link
              key={f.key}
              href={`/admin/redressal?filter=${f.key}`}
              className={
                active
                  ? 'rounded-md bg-brand-subtle px-3 py-1.5 text-[13px] font-medium text-brand'
                  : 'rounded-md px-3 py-1.5 text-[13px] font-medium text-muted hover:bg-surface-sunken'
              }
            >
              {f.label} ({f.count})
            </Link>
          );
        })}
      </div>

      <Card>
        <CardHeader title={`${humanize(filter ?? 'open')} cases`} description={`${cases.length} shown`} />
        {cases.length === 0 ? (
          <EmptyState
            icon={LifeBuoy}
            title="No cases here"
            description={
              filter === 'breached'
                ? 'Nothing has passed its resolution deadline.'
                : 'Cases raised by students and staff appear here with their SLA state.'
            }
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Case</Th>
                <Th>Category</Th>
                <Th>Status</Th>
                <Th>Assigned to</Th>
                <Th align="right">Deadline</Th>
              </tr>
            </thead>
            <tbody>
              {cases.map((c) => {
                const hoursLeft = c.resolutionDueAt
                  ? Math.round((c.resolutionDueAt.getTime() - now.getTime()) / 3600_000)
                  : null;
                return (
                  <tr key={c.id} className="hover:bg-surface-sunken">
                    <Td>
                      <Link
                        href={`/admin/redressal/${c.id}`}
                        className="block text-[13.5px] font-medium text-default hover:text-brand"
                      >
                        {c.subject}
                      </Link>
                      <span className="flex items-center gap-1.5 pt-1">
                        <span className="font-mono text-[11px] text-subtle">{c.caseNumber}</span>
                        <Badge tone={URGENCY_TONE[c.urgency]}>{humanize(c.urgency)}</Badge>
                        {c.isAnonymous ? <Badge tone="neutral">Anonymous</Badge> : null}
                      </span>
                    </Td>
                    <Td><span className="text-[13px] text-muted">{c.category}</span></Td>
                    <Td><Badge tone="neutral">{humanize(c.status)}</Badge></Td>
                    <Td>
                      <span className="text-[13px] text-muted">
                        {c.assigneeFirst ? `${c.assigneeFirst} ${c.assigneeLast ?? ''}`.trim() : 'Unassigned'}
                      </span>
                    </Td>
                    <Td align="right">
                      {c.isSlaBreached ? (
                        <Badge tone="danger">Past deadline</Badge>
                      ) : hoursLeft !== null ? (
                        <span
                          className={`tabular text-[12.5px] ${hoursLeft < 12 ? 'text-warning' : 'text-muted'}`}
                        >
                          {hoursLeft}h left
                        </span>
                      ) : (
                        <span className="text-[12.5px] text-subtle">—</span>
                      )}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
