import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Clock, ShieldCheck } from 'lucide-react';
import { requirePermission } from '@/lib/auth/context';
import { getGrievance } from '@/services/grievance';
import { ForbiddenError, NotFoundError } from '@/lib/api';
import {
  Alert,
  Badge,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  PageHeader,
  Section,
} from '@/components/ui';
import { formatDateTime, humanize, pluralize, relativeTime } from '@/lib/utils';
import { GRIEVANCE_STATUS_TONE } from '../../_lib/faculty';

export const dynamic = 'force-dynamic';

export default async function GrievanceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requirePermission('grievance:view_own');
  const { id } = await params;

  let grievance;
  try {
    grievance = await getGrievance(user, id);
  } catch (error) {
    // A case the caller may not see is indistinguishable from one that does
    // not exist — we never confirm the existence of other people's cases.
    if (error instanceof NotFoundError || error instanceof ForbiddenError) notFound();
    throw error;
  }

  const visibleMessages = grievance.messages.filter(
    (m) => !m.isInternalNote || grievance.assignedToId === user.userId,
  );

  return (
    <div>
      <PageHeader
        breadcrumb={
          <Link href="/faculty/readdressal" className="text-[12.5px] text-muted hover:text-brand">
            ← Readdressal
          </Link>
        }
        title={grievance.subject}
        description={`${grievance.caseNumber} · ${grievance.category} · raised ${relativeTime(
          grievance.createdAt,
        )}`}
        action={
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge tone={grievance.urgency === 'CRITICAL' ? 'danger' : 'outline'}>
              {grievance.urgency.toLowerCase()}
            </Badge>
            <Badge tone={GRIEVANCE_STATUS_TONE[grievance.status] ?? 'neutral'} dot>
              {humanize(grievance.status)}
            </Badge>
          </div>
        }
      />

      {grievance.isSlaBreached ? (
        <Alert tone="danger" icon={Clock} title="This case is past its resolution deadline" className="mb-5">
          The deadline set by the category configuration has passed. It has been escalated
          {grievance.escalationLevel > 0
            ? ` ${pluralize(grievance.escalationLevel, 'time')}`
            : ''}
          .
        </Alert>
      ) : grievance.slaHoursRemaining !== null && grievance.resolvedAt === null ? (
        <Alert tone="info" icon={Clock} className="mb-5">
          {grievance.slaHoursRemaining > 0
            ? `${pluralize(Math.round(grievance.slaHoursRemaining), 'hour')} left against the resolution target.`
            : 'The resolution target has been reached.'}
        </Alert>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="space-y-4">
          <Card>
            <CardHeader title="What was reported" />
            <CardBody>
              <p className="whitespace-pre-wrap text-[13.5px] leading-relaxed text-default">
                {grievance.description}
              </p>
            </CardBody>
          </Card>

          <Section title="Conversation">
            <Card>
              {visibleMessages.length === 0 ? (
                <EmptyState
                  title="No messages yet"
                  description="Replies from the handler appear here."
                />
              ) : (
                <ul className="divide-y divide-[hsl(var(--border))]">
                  {visibleMessages.map((m) => (
                    <li key={m.id} className="px-5 py-3.5">
                      <div className="flex items-center gap-2">
                        <span className="text-[13px] font-medium text-default">
                          {m.authorName ?? 'System'}
                        </span>
                        {m.isInternalNote ? <Badge tone="warning">internal note</Badge> : null}
                        <span className="text-[12px] text-subtle">
                          {formatDateTime(m.createdAt)}
                        </span>
                      </div>
                      <p className="mt-1 whitespace-pre-wrap text-[13px] leading-relaxed text-default">
                        {m.body}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </Section>

          {grievance.resolutionSummary ? (
            <Card>
              <CardHeader title="Resolution" icon={ShieldCheck} />
              <CardBody>
                <p className="whitespace-pre-wrap text-[13.5px] leading-relaxed text-default">
                  {grievance.resolutionSummary}
                </p>
              </CardBody>
            </Card>
          ) : null}
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Case details" />
            <CardBody>
              <dl className="space-y-2.5 text-[13px]">
                <Row label="Raised by">
                  {grievance.isAnonymous && !grievance.raisedByName
                    ? 'Anonymous'
                    : (grievance.raisedByName ?? 'Unknown')}
                </Row>
                <Row label="Handler">{grievance.assignedToName ?? 'Not yet assigned'}</Row>
                <Row label="Raised">{formatDateTime(grievance.createdAt)}</Row>
                <Row label="Response due">
                  {grievance.responseDueAt ? formatDateTime(grievance.responseDueAt) : '—'}
                </Row>
                <Row label="Resolution due">
                  {grievance.resolutionDueAt ? formatDateTime(grievance.resolutionDueAt) : '—'}
                </Row>
                <Row label="Resolved">
                  {grievance.resolvedAt ? formatDateTime(grievance.resolvedAt) : 'Not yet'}
                </Row>
              </dl>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="History" description="Every change, in order." />
            <CardBody>
              {grievance.timeline.length === 0 ? (
                <p className="text-[13px] text-muted">No recorded events.</p>
              ) : (
                <ol className="space-y-3">
                  {grievance.timeline.map((event, i) => (
                    <li key={i} className="border-l-2 border-[hsl(var(--border))] pl-3">
                      <p className="text-[12.5px] font-medium text-default">
                        {humanize(event.kind)}
                        {event.toValue ? `: ${humanize(event.toValue)}` : ''}
                      </p>
                      <p className="text-[11.5px] text-subtle">
                        {event.isSystemGenerated
                          ? 'Automatic'
                          : (event.actorName ?? 'Unknown')}{' '}
                        · {relativeTime(event.createdAt)}
                      </p>
                      {event.note ? (
                        <p className="mt-0.5 text-[12px] text-muted">{event.note}</p>
                      ) : null}
                    </li>
                  ))}
                </ol>
              )}
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted">{label}</dt>
      <dd className="text-right text-default">{children}</dd>
    </div>
  );
}
