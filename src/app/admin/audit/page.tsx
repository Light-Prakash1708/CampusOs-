import { and, desc, eq, ilike, or, sql } from 'drizzle-orm';
import { Lock, ScrollText, Search } from 'lucide-react';
import { db } from '@/lib/db';
import * as t from '@/lib/db/schema';
import { requirePermission } from '@/lib/auth/context';
import { Alert, Badge, Card, CardHeader, EmptyState, Input, PageHeader, Table, Td, Th } from '@/components/ui';
import { formatDateTime, humanize, truncate } from '@/lib/utils';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Audit log · CampusOS' };

/**
 * The audit log. This table rejects UPDATE and DELETE at the database level,
 * so what is displayed here cannot have been rewritten by the application.
 */
export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const user = await requirePermission('audit:view');
  const { q } = await searchParams;
  const term = (q ?? '').trim();

  const rows = await db
    .select({
      id: t.auditLogs.id,
      action: t.auditLogs.action,
      entityType: t.auditLogs.entityType,
      entityId: t.auditLogs.entityId,
      reason: t.auditLogs.reason,
      beforeValue: t.auditLogs.beforeValue,
      afterValue: t.auditLogs.afterValue,
      ipAddress: t.auditLogs.ipAddress,
      createdAt: t.auditLogs.createdAt,
      actorRole: t.auditLogs.actorRole,
      actorFirst: t.users.firstName,
      actorLast: t.users.lastName,
    })
    .from(t.auditLogs)
    .leftJoin(t.users, eq(t.users.id, t.auditLogs.actorId))
    .where(
      and(
        eq(t.auditLogs.institutionId, user.institutionId),
        term
          ? or(
              ilike(t.auditLogs.action, `%${term}%`),
              ilike(t.auditLogs.entityType, `%${term}%`),
              ilike(t.users.firstName, `%${term}%`),
              ilike(t.users.lastName, `%${term}%`),
            )
          : sql`true`,
      ),
    )
    .orderBy(desc(t.auditLogs.createdAt))
    .limit(200);

  return (
    <div>
      <PageHeader
        title="Audit log"
        description="Every consequential action, permanently recorded."
      />

      <Alert tone="info" className="mb-4" icon={Lock} title="Append-only">
        This table rejects updates and deletions at the database level. Nothing shown here can have
        been altered after the fact, including by an administrator.
      </Alert>

      <form className="mb-4 max-w-sm" action="/admin/audit">
        <div className="relative">
          <Search size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-subtle" />
          <Input name="q" defaultValue={term} placeholder="Filter by action, entity or person" className="pl-8" />
        </div>
      </form>

      <Card>
        <CardHeader title="Recent activity" description={`${rows.length} most recent entries`} />
        {rows.length === 0 ? (
          <EmptyState
            icon={ScrollText}
            title={term ? 'Nothing matches that filter' : 'No audited actions yet'}
            description="Logins, timetable publishes, attendance corrections and approvals appear here."
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>When</Th>
                <Th>Actor</Th>
                <Th>Action</Th>
                <Th>Entity</Th>
                <Th>Detail</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-surface-sunken">
                  <Td>
                    <span className="tabular text-[12.5px] text-muted">
                      {formatDateTime(r.createdAt)}
                    </span>
                  </Td>
                  <Td>
                    <span className="text-[13px] text-default">
                      {r.actorFirst ? `${r.actorFirst} ${r.actorLast ?? ''}`.trim() : 'System'}
                    </span>
                    {r.actorRole ? (
                      <span className="block text-[11px] text-subtle">{humanize(r.actorRole)}</span>
                    ) : null}
                  </Td>
                  <Td><Badge tone="neutral">{humanize(r.action)}</Badge></Td>
                  <Td><span className="text-[12.5px] text-muted">{r.entityType}</span></Td>
                  <Td>
                    {r.reason ? (
                      <span className="block text-[12.5px] text-default">{truncate(r.reason, 90)}</span>
                    ) : null}
                    {r.afterValue ? (
                      <span className="block font-mono text-[11px] text-subtle">
                        {truncate(JSON.stringify(r.afterValue), 90)}
                      </span>
                    ) : null}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
