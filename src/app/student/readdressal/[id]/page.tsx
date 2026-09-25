import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import {
  AlertTriangle,
  ChevronLeft,
  CircleCheck,
  Clock,
  MessageSquare,
  Timer,
  UserCog,
} from 'lucide-react';
import {
  Alert,
  Avatar,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  Divider,
  EmptyState,
  PageHeader,
} from '@/components/ui';
import { cn, formatDateTime, humanize, relativeTime } from '@/lib/utils';
import { isEnabled } from '@/lib/features';
import { ForbiddenError, NotFoundError } from '@/lib/api';
import { getGrievance, type GrievanceDetail } from '@/services/grievance';

import { requireStudentContext } from '../../_lib/auth';
import { slaState } from '../../_lib/sla';
import { grievanceStatusTone, ModuleDisabled, ProseBody, urgencyTone } from '../../_components/bits';
import { ReplyBox } from './ReplyBox';

export const dynamic = 'force-dynamic';

const CLOSED_STATES = ['RESOLVED', 'CLOSED', 'WITHDRAWN'];

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return { title: `Case ${id.slice(0, 8)}` };
}

export default async function CaseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireStudentContext('grievance:view_own');
  const { id } = await params;

  if (!isEnabled(user.featureFlags, 'grievance_enabled')) {
    return (
      <>
        <PageHeader title="Case" />
        <ModuleDisabled
          module="The Readdressal Centre"
          blurb="Structured grievance handling is not part of your institution's current configuration."
        />
      </>
    );
  }

  let detail: GrievanceDetail;
  try {
    detail = await getGrievance(user, id);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    if (error instanceof ForbiddenError) redirect('/forbidden?permission=grievance%3Aview_own');
    throw error;
  }

  // `GrievanceDetail` does not expose `firstResponseAt`, so the response clock
  // is derived from visible evidence: the first message from someone other
  // than the raiser.
  const firstHandlerReply =
    detail.messages.find((m) => m.authorName && m.authorName !== detail.raisedByName) ?? null;

  const sla = slaState({
    responseDueAt: detail.responseDueAt,
    resolutionDueAt: detail.resolutionDueAt,
    firstResponseAt: firstHandlerReply?.createdAt ?? null,
    resolvedAt: detail.resolvedAt,
    isSlaBreached: detail.isSlaBreached,
  });

  const isClosed = CLOSED_STATES.includes(detail.status);

  return (
    <>
      <PageHeader
        title={detail.subject}
        description={`${detail.category} · raised ${formatDateTime(detail.createdAt)}`}
        breadcrumb={
          <Button asChild size="sm" variant="ghost" icon={ChevronLeft}>
            <Link href="/student/readdressal">All cases</Link>
          </Button>
        }
        action={
          <div className="flex items-center gap-2">
            <Badge tone={urgencyTone(detail.urgency)}>{humanize(detail.urgency)}</Badge>
            <Badge tone={grievanceStatusTone(detail.status)}>{humanize(detail.status)}</Badge>
          </div>
        }
      />

      <p className="mb-5 font-mono text-[12px] text-subtle">{detail.caseNumber}</p>

      {detail.isSlaBreached ? (
        <Alert
          className="mb-5"
          tone="danger"
          icon={AlertTriangle}
          title="This case missed its deadline"
        >
          The escalation engine has recorded the breach and raised it to the next level. You do not
          need to chase it — but you can add a reply if there is anything new.
        </Alert>
      ) : null}

      {detail.resolutionSummary ? (
        <Alert className="mb-5" tone="success" icon={CircleCheck} title="Resolution">
          {detail.resolutionSummary}
        </Alert>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-3">
        {/* ---------------------------- Conversation ------------------------- */}
        <div className="space-y-5 lg:col-span-2">
          <Card>
            <CardHeader title="Conversation" icon={MessageSquare} />
            <CardBody className="space-y-4">
              <Message
                author={detail.isAnonymous ? 'You (anonymous)' : (detail.raisedByName ?? 'You')}
                at={detail.createdAt}
                body={detail.description}
                isMine
              />

              {detail.messages.length === 0 ? (
                <>
                  <Divider />
                  <p className="text-[13px] text-muted">
                    No replies yet. The handler responds within the deadline shown alongside.
                  </p>
                </>
              ) : (
                detail.messages.map((message) => (
                  <Message
                    key={message.id}
                    author={message.authorName ?? 'Case handler'}
                    at={message.createdAt}
                    body={message.body}
                    isMine={message.authorName === detail.raisedByName}
                  />
                ))
              )}
            </CardBody>
          </Card>

          <Card>
            <CardBody>
              <ReplyBox
                grievanceId={detail.id}
                disabled={isClosed}
                disabledReason={
                  detail.status === 'WITHDRAWN'
                    ? 'You withdrew this case, so it no longer accepts replies.'
                    : 'This case is closed. If the issue has come back, raise a new case referencing this one.'
                }
              />
            </CardBody>
          </Card>
        </div>

        {/* ------------------------------ Sidebar ---------------------------- */}
        <div className="space-y-5">
          <Card>
            <CardHeader title="Deadline" icon={Timer} />
            <CardBody className="space-y-3">
              <p
                className={cn(
                  'rounded-md px-3 py-2 text-[13px] font-medium',
                  sla.breached
                    ? 'bg-danger-subtle text-danger'
                    : sla.urgent
                      ? 'bg-warning-subtle text-warning'
                      : 'bg-surface-sunken text-default',
                )}
              >
                {sla.label}
              </p>

              <dl className="space-y-2 text-[12.5px]">
                <Row label="First response due" value={formatDateTime(detail.responseDueAt)} />
                <Row label="Resolution due" value={formatDateTime(detail.resolutionDueAt)} />
                {detail.resolvedAt ? (
                  <Row label="Resolved" value={formatDateTime(detail.resolvedAt)} />
                ) : null}
                {detail.escalationLevel > 0 ? (
                  <Row label="Escalation level" value={String(detail.escalationLevel)} />
                ) : null}
              </dl>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Handling" icon={UserCog} />
            <CardBody>
              <dl className="space-y-2 text-[12.5px]">
                <Row label="Category" value={detail.category} />
                <Row label="Assigned to" value={detail.assignedToName ?? 'Not assigned yet'} />
                <Row label="Raised by" value={detail.isAnonymous ? 'Anonymous' : (detail.raisedByName ?? '—')} />
                <Row label="Status" value={humanize(detail.status)} />
              </dl>
              {detail.isAnonymous ? (
                <p className="mt-3 text-[12px] leading-relaxed text-subtle">
                  Your identity is withheld from handlers. Ordinary administrators cannot reveal it,
                  and any reveal by a privileged account is written to the audit log.
                </p>
              ) : null}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Timeline" icon={Clock} description="Every state change, in order" />
            <CardBody className="p-0">
              {detail.timeline.length === 0 ? (
                <EmptyState
                  icon={Clock}
                  title="No recorded events"
                  description="State changes appear here as the case moves."
                />
              ) : (
                <ol className="relative px-5 py-4">
                  <span
                    className="absolute left-[26px] top-6 bottom-6 w-px bg-[hsl(var(--border))]"
                    aria-hidden
                  />
                  {detail.timeline.map((event, index) => (
                    <li key={index} className="relative flex gap-3 pb-4 last:pb-0">
                      <span
                        className={cn(
                          'relative z-10 mt-0.5 flex h-3 w-3 shrink-0 items-center justify-center rounded-full ring-4 ring-[hsl(var(--surface-raised))]',
                          event.kind === 'SLA_BREACHED' || event.kind === 'ESCALATED'
                            ? 'bg-danger'
                            : event.isSystemGenerated
                              ? 'bg-warning'
                              : 'bg-brand',
                        )}
                        aria-hidden
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] font-medium text-default">
                          {humanize(event.kind)}
                          {event.toValue && event.kind !== 'ASSIGNED'
                            ? ` → ${humanize(event.toValue)}`
                            : ''}
                        </p>
                        {event.note ? (
                          <p className="mt-0.5 text-[12.5px] leading-relaxed text-muted">
                            {event.note}
                          </p>
                        ) : null}
                        <p className="mt-0.5 text-[11.5px] text-subtle">
                          {formatDateTime(event.createdAt)}
                          {event.isSystemGenerated
                            ? ' · automatic'
                            : event.actorName
                              ? ` · ${event.actorName}`
                              : ''}
                        </p>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="shrink-0 text-subtle">{label}</dt>
      <dd className="min-w-0 text-right text-default">{value}</dd>
    </div>
  );
}

function Message({
  author,
  at,
  body,
  isMine,
}: {
  author: string;
  at: Date;
  body: string;
  isMine: boolean;
}) {
  return (
    <div className="flex gap-3">
      <Avatar name={author} size={30} className="mt-0.5" />
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-[13px] font-medium text-default">{author}</span>
          {isMine ? <Badge tone="neutral">you</Badge> : null}
          <span className="text-[11.5px] text-subtle" title={formatDateTime(at)}>
            {relativeTime(at)}
          </span>
        </p>
        <div
          className={cn(
            'mt-1.5 rounded-lg border px-3 py-2.5',
            isMine
              ? 'border-[hsl(var(--border))] bg-surface-muted'
              : 'border-[hsl(var(--brand-border))] bg-brand-subtle',
          )}
        >
          <ProseBody text={body} className="text-[13px]" />
        </div>
      </div>
    </div>
  );
}
