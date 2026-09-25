import Link from 'next/link';
import { notFound } from 'next/navigation';
import { and, eq } from 'drizzle-orm';
import { ArrowLeft, CheckCircle2, Users } from 'lucide-react';
import { db } from '@/lib/db';
import * as t from '@/lib/db/schema';
import { requireAuth } from '@/lib/auth/context';
import {
  Alert, Badge, Card, CardBody, CardHeader, EmptyState, PageHeader, Progress, Stat, Table, Td, Th,
} from '@/components/ui';
import { formatDateTime, humanize, pluralize } from '@/lib/utils';
import { getAcknowledgementStatus } from '@/services/communication';

export const dynamic = 'force-dynamic';

/**
 * Notice detail with acknowledgement tracking.
 * The "who has not read this" list is the feature that ends "I didn't know".
 */
export default async function NoticeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireAuth();
  const { id } = await params;

  const [notice] = await db
    .select({
      a: t.announcements,
      authorFirst: t.users.firstName,
      authorLast: t.users.lastName,
    })
    .from(t.announcements)
    .leftJoin(t.users, eq(t.users.id, t.announcements.authorId))
    .where(
      and(eq(t.announcements.id, id), eq(t.announcements.institutionId, user.institutionId)),
    )
    .limit(1);

  if (!notice) notFound();
  const a = notice.a;

  const canSeeAnalytics =
    user.permissions.has('announcement:view_analytics') ||
    a.authorId === user.userId;

  const status = canSeeAnalytics
    ? await getAcknowledgementStatus(user.institutionId, id)
    : null;

  const readPct = a.recipientCount ? Math.round((a.readCount / a.recipientCount) * 100) : 0;
  const ackPct = a.recipientCount
    ? Math.round((a.acknowledgedCount / a.recipientCount) * 100)
    : 0;

  return (
    <div>
      <PageHeader
        title={a.title}
        description={`${a.reference} · ${humanize(a.category)} · ${humanize(a.priority)}`}
        breadcrumb={
          <Link
            href="/admin/communications"
            className="inline-flex items-center gap-1 text-[12.5px] text-muted hover:text-default"
          >
            <ArrowLeft size={13} /> Communications
          </Link>
        }
      />

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card>
            <CardHeader
              title="Message"
              action={
                <span className="flex gap-1.5">
                  {a.kind === 'OFFICIAL' ? <Badge tone="brand">Official</Badge> : null}
                  {a.isEmergencyBroadcast ? <Badge tone="danger">Emergency</Badge> : null}
                  <Badge tone="neutral">{humanize(a.status)}</Badge>
                </span>
              }
            />
            <CardBody>
              <p className="whitespace-pre-wrap text-[14px] leading-relaxed text-default">{a.body}</p>
              <p className="mt-4 border-t border-[hsl(var(--border))] pt-3 text-[12.5px] text-subtle">
                Published by{' '}
                {notice.authorFirst ? `${notice.authorFirst} ${notice.authorLast ?? ''}`.trim() : 'the system'}
                {a.publishedAt ? ` on ${formatDateTime(a.publishedAt)}` : ''}
                {a.expiresAt ? ` · expires ${formatDateTime(a.expiresAt)}` : ''}
              </p>
            </CardBody>
          </Card>

          {canSeeAnalytics && status ? (
            <Card>
              <CardHeader
                title="Not yet acknowledged"
                icon={Users}
                description={
                  a.requiresAcknowledgement
                    ? `${status.pending.length} of ${status.total} have not confirmed`
                    : 'This notice does not require acknowledgement'
                }
              />
              {!a.requiresAcknowledgement ? (
                <EmptyState
                  title="Acknowledgement was not required"
                  description="Read tracking is still recorded, but nobody was asked to confirm."
                />
              ) : status.pending.length === 0 ? (
                <EmptyState
                  icon={CheckCircle2}
                  title="Everyone has acknowledged"
                  description="All recipients confirmed they read this notice."
                />
              ) : (
                <Table>
                  <thead>
                    <tr>
                      <Th>Name</Th>
                      <Th>Role</Th>
                      <Th>Section</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {status.pending.slice(0, 60).map((p) => (
                      <tr key={p.userId}>
                        <Td>{p.name}</Td>
                        <Td><span className="text-[12.5px] text-muted">{humanize(p.role)}</span></Td>
                        <Td><span className="text-[12.5px] text-muted">{p.sectionCode ?? '—'}</span></Td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              )}
              {status.pending.length > 60 ? (
                <CardBody className="pt-0">
                  <p className="text-[12.5px] text-subtle">
                    and {status.pending.length - 60} more.
                  </p>
                </CardBody>
              ) : null}
            </Card>
          ) : null}
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader title="Reach" />
            <CardBody className="space-y-4">
              <Stat label="Recipients" value={a.recipientCount.toLocaleString('en-IN')} />
              <div>
                <div className="flex items-center justify-between text-[13px]">
                  <span className="text-muted">Read</span>
                  <span className="tabular font-medium text-default">
                    {a.readCount}/{a.recipientCount}
                  </span>
                </div>
                <Progress
                  value={readPct}
                  tone={readPct > 80 ? 'success' : readPct > 55 ? 'warning' : 'danger'}
                  className="mt-1.5"
                />
              </div>
              {a.requiresAcknowledgement ? (
                <div>
                  <div className="flex items-center justify-between text-[13px]">
                    <span className="text-muted">Acknowledged</span>
                    <span className="tabular font-medium text-default">
                      {a.acknowledgedCount}/{a.recipientCount}
                    </span>
                  </div>
                  <Progress
                    value={ackPct}
                    tone={ackPct > 80 ? 'success' : ackPct > 55 ? 'warning' : 'danger'}
                    className="mt-1.5"
                  />
                  {a.acknowledgementDeadline ? (
                    <p className="mt-1.5 text-[12px] text-subtle">
                      Deadline {formatDateTime(a.acknowledgementDeadline)}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </CardBody>
          </Card>

          {a.requiresAcknowledgement && ackPct < 100 ? (
            <Alert tone="warning" title="Follow-up needed">
              {pluralize(a.recipientCount - a.acknowledgedCount, 'person', 'people')} have not
              confirmed. Their names are listed so you can follow up directly rather than
              re-broadcasting to everyone.
            </Alert>
          ) : null}
        </div>
      </div>
    </div>
  );
}
