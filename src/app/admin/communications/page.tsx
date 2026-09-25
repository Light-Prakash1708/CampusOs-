import Link from 'next/link';
import { and, desc, eq } from 'drizzle-orm';
import { Megaphone, Plus, ShieldAlert } from 'lucide-react';
import { db } from '@/lib/db';
import * as t from '@/lib/db/schema';
import { requireAnyPermission } from '@/lib/auth/context';
import {
  Badge, Button, Card, CardBody, CardHeader, EmptyState, PageHeader, Progress, Section, Stat, Table, Td, Th,
} from '@/components/ui';
import { formatDateTime, humanize, pluralize, relativeTime } from '@/lib/utils';
import { computeCommunicationHealth } from '@/services/analytics';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Communications · CampusOS' };

const PRIORITY_TONE = {
  CRITICAL: 'danger', IMPORTANT: 'warning', NORMAL: 'neutral', INFORMATIONAL: 'info',
} as const;

export default async function CommunicationsPage() {
  const user = await requireAnyPermission([
    'announcement:create_official',
    'announcement:create_informational',
    'announcement:view_analytics',
  ]);

  const [notices, health] = await Promise.all([
    db
      .select({
        id: t.announcements.id,
        reference: t.announcements.reference,
        title: t.announcements.title,
        kind: t.announcements.kind,
        category: t.announcements.category,
        priority: t.announcements.priority,
        status: t.announcements.status,
        publishedAt: t.announcements.publishedAt,
        recipientCount: t.announcements.recipientCount,
        readCount: t.announcements.readCount,
        acknowledgedCount: t.announcements.acknowledgedCount,
        requiresAck: t.announcements.requiresAcknowledgement,
        isEmergency: t.announcements.isEmergencyBroadcast,
        authorFirst: t.users.firstName,
        authorLast: t.users.lastName,
      })
      .from(t.announcements)
      .leftJoin(t.users, eq(t.users.id, t.announcements.authorId))
      .where(eq(t.announcements.institutionId, user.institutionId))
      .orderBy(desc(t.announcements.createdAt))
      .limit(60),
    computeCommunicationHealth(user.institutionId),
  ]);

  return (
    <div>
      <PageHeader
        title="Communications"
        description="Official notices, who received them, and who has actually confirmed reading."
        action={
          <Button asChild variant="primary" icon={Plus}>
            <Link href="/admin/communications/new">New notice</Link>
          </Button>
        }
      />

      <Section title="Reach over the last 30 days">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Notices published" value={health.publishedLast30Days} icon={Megaphone} />
          <Stat
            label="Average read rate"
            value={`${health.averageReadRate}%`}
            tone={health.averageReadRate < 70 ? 'warning' : 'success'}
          />
          <Stat
            label="Average acknowledgement"
            value={`${health.averageAcknowledgementRate}%`}
            sublabel={`across ${pluralize(health.noticesRequiringAck, 'notice')}`}
          />
          <Stat
            label="Outstanding acknowledgements"
            value={health.outstandingAcknowledgements}
            tone={health.outstandingAcknowledgements > 0 ? 'warning' : 'success'}
          />
        </div>
      </Section>

      {health.worstPerforming.length > 0 ? (
        <Section title="Lowest reach">
          <Card>
            <CardBody className="space-y-3">
              {health.worstPerforming.map((n) => (
                <div key={n.reference}>
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-[13px] font-medium text-default">{n.title}</p>
                    <span className="tabular shrink-0 text-[12.5px] text-muted">{n.readRate}%</span>
                  </div>
                  <Progress
                    value={n.readRate}
                    tone={n.readRate > 80 ? 'success' : n.readRate > 55 ? 'warning' : 'danger'}
                    className="mt-1.5"
                  />
                  <p className="mt-0.5 text-[11.5px] text-subtle">
                    {pluralize(n.pending, 'person', 'people')} still pending
                  </p>
                </div>
              ))}
            </CardBody>
          </Card>
        </Section>
      ) : null}

      <Card>
        <CardHeader title="All notices" description={`${notices.length} shown`} />
        {notices.length === 0 ? (
          <EmptyState
            icon={Megaphone}
            title="No notices yet"
            description="Published notices, their audience and their acknowledgement state appear here."
            action={
              <Button asChild variant="primary">
                <Link href="/admin/communications/new">Write the first notice</Link>
              </Button>
            }
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Notice</Th>
                <Th>Category</Th>
                <Th align="right">Recipients</Th>
                <Th align="right">Read</Th>
                <Th align="right">Acknowledged</Th>
                <Th>Published</Th>
              </tr>
            </thead>
            <tbody>
              {notices.map((n) => {
                const readPct = n.recipientCount
                  ? Math.round((n.readCount / n.recipientCount) * 100)
                  : 0;
                const ackPct = n.recipientCount
                  ? Math.round((n.acknowledgedCount / n.recipientCount) * 100)
                  : 0;
                return (
                  <tr key={n.id} className="hover:bg-surface-sunken">
                    <Td>
                      <Link
                        href={`/admin/communications/${n.id}`}
                        className="block text-[13.5px] font-medium text-default hover:text-brand"
                      >
                        {n.title}
                      </Link>
                      <span className="flex flex-wrap items-center gap-1.5 pt-1">
                        <span className="font-mono text-[11px] text-subtle">{n.reference}</span>
                        {n.kind === 'OFFICIAL' ? <Badge tone="brand">Official</Badge> : null}
                        {n.isEmergency ? <Badge tone="danger">Emergency</Badge> : null}
                        {n.status !== 'PUBLISHED' ? (
                          <Badge tone="neutral">{humanize(n.status)}</Badge>
                        ) : null}
                      </span>
                    </Td>
                    <Td>
                      <Badge tone={PRIORITY_TONE[n.priority]}>{humanize(n.priority)}</Badge>
                      <span className="block pt-1 text-[11.5px] text-subtle">
                        {humanize(n.category)}
                      </span>
                    </Td>
                    <Td align="right" className="tabular">{n.recipientCount.toLocaleString('en-IN')}</Td>
                    <Td align="right" className="tabular">
                      {n.recipientCount ? `${readPct}%` : '—'}
                    </Td>
                    <Td align="right" className="tabular">
                      {n.requiresAck ? (
                        <span className={ackPct < 80 ? 'text-warning' : 'text-success'}>
                          {ackPct}%
                        </span>
                      ) : (
                        <span className="text-subtle">not required</span>
                      )}
                    </Td>
                    <Td>
                      <span className="text-[12.5px] text-muted">
                        {n.publishedAt ? relativeTime(n.publishedAt) : '—'}
                      </span>
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
