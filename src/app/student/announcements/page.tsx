import Link from 'next/link';
import { Megaphone, Paperclip, ShieldCheck } from 'lucide-react';
import {
  Badge,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  PageHeader,
  Section,
} from '@/components/ui';
import { cn, formatDate, formatDateTime, humanize, pluralize, relativeTime } from '@/lib/utils';

import { requireStudentContext } from '../_lib/auth';
import { getStudentAnnouncements, type StudentAnnouncement } from '../_lib/campus';
import { AskAiLink, categoryIcon, priorityTone, ProseBody } from '../_components/bits';
import { AnnouncementActions } from './AnnouncementActions';

export const metadata = { title: 'Announcements' };
export const dynamic = 'force-dynamic';

type Filter = 'all' | 'unread' | 'action';

export default async function AnnouncementsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const user = await requireStudentContext();
  const { filter: rawFilter } = await searchParams;
  const filter: Filter =
    rawFilter === 'unread' || rawFilter === 'action' ? rawFilter : 'all';

  const announcements = await getStudentAnnouncements(user.institutionId, user.userId);

  const unreadCount = announcements.filter((a) => !a.readAt).length;
  const actionCount = announcements.filter(
    (a) => a.requiresAcknowledgement && !a.acknowledgedAt,
  ).length;

  const visible = announcements.filter((a) => {
    if (filter === 'unread') return !a.readAt;
    if (filter === 'action') return a.requiresAcknowledgement && !a.acknowledgedAt;
    return true;
  });

  const tabs: { key: Filter; label: string; count: number }[] = [
    { key: 'all', label: 'All', count: announcements.length },
    { key: 'unread', label: 'Unread', count: unreadCount },
    { key: 'action', label: 'Needs action', count: actionCount },
  ];

  return (
    <>
      <PageHeader
        title="Announcements"
        description="Official and informational notices addressed to you. Every notice records who published it and why you received it."
      />

      {announcements.length === 0 ? (
        <Card>
          <CardBody className="p-0">
            <EmptyState
              icon={Megaphone}
              title="No notices yet"
              description="When your institution, department or section publishes a notice that includes you, it appears here."
            />
          </CardBody>
        </Card>
      ) : (
        <>
          <nav
            className="mb-5 flex flex-wrap items-center gap-1.5"
            aria-label="Filter announcements"
          >
            {tabs.map((tab) => (
              <Link
                key={tab.key}
                href={tab.key === 'all' ? '/student/announcements' : `?filter=${tab.key}`}
                aria-current={filter === tab.key ? 'page' : undefined}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12.5px] font-medium transition-colors',
                  filter === tab.key
                    ? 'border-[hsl(var(--brand-border))] bg-brand-subtle text-brand'
                    : 'border-[hsl(var(--border-strong))] text-muted hover:bg-surface-sunken',
                )}
              >
                {tab.label}
                <span className="tabular text-[11.5px] text-subtle">{tab.count}</span>
              </Link>
            ))}
          </nav>

          {visible.length === 0 ? (
            <Card>
              <CardBody className="p-0">
                <EmptyState
                  icon={ShieldCheck}
                  title={
                    filter === 'action'
                      ? 'Nothing needs your acknowledgement'
                      : 'Nothing unread'
                  }
                  description={
                    filter === 'action'
                      ? 'You have acknowledged every notice that required it.'
                      : 'You have read every notice addressed to you.'
                  }
                />
              </CardBody>
            </Card>
          ) : (
            <Section
              title={`${pluralize(visible.length, 'notice')}`}
              description="Newest first"
            >
              <div className="space-y-4">
                {visible.map((announcement) => (
                  <AnnouncementCard key={announcement.id} announcement={announcement} />
                ))}
              </div>
            </Section>
          )}
        </>
      )}
    </>
  );
}

function AnnouncementCard({ announcement }: { announcement: StudentAnnouncement }) {
  const Icon = categoryIcon(announcement.category);
  const needsAction = announcement.requiresAcknowledgement && !announcement.acknowledgedAt;
  const expired = !!announcement.expiresAt && announcement.expiresAt.getTime() < Date.now();

  return (
    <Card
      id={announcement.reference}
      className={cn(
        'scroll-mt-20',
        needsAction && 'border-[hsl(var(--warning-border))]',
        announcement.priority === 'CRITICAL' && 'border-[hsl(var(--danger-border))]',
      )}
    >
      <CardHeader
        title={announcement.title}
        icon={Icon}
        action={
          <div className="flex flex-col items-end gap-1.5">
            <Badge tone={priorityTone(announcement.priority)}>
              {humanize(announcement.priority)}
            </Badge>
            {announcement.kind === 'OFFICIAL' ? (
              <Badge tone="brand" icon={ShieldCheck}>
                Official
              </Badge>
            ) : null}
          </div>
        }
      >
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-subtle">
          <span className="font-mono">{announcement.reference}</span>
          <span>{humanize(announcement.category)}</span>
          {announcement.authorName ? <span>{announcement.authorName}</span> : null}
          {announcement.departmentName ? <span>{announcement.departmentName}</span> : null}
          <span>
            {announcement.publishedAt
              ? `Published ${formatDate(announcement.publishedAt)} · ${relativeTime(announcement.publishedAt)}`
              : 'Not published'}
          </span>
          {!announcement.readAt ? (
            <Badge tone="brand" dot>
              unread
            </Badge>
          ) : null}
          {expired ? <Badge tone="neutral">expired</Badge> : null}
        </div>
      </CardHeader>

      <CardBody className="space-y-3">
        <ProseBody text={announcement.body} />

        {announcement.attachments.length > 0 ? (
          <ul className="space-y-1.5">
            {announcement.attachments.map((attachment) => (
              <li key={attachment.url}>
                <a
                  href={attachment.url}
                  className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-brand hover:underline"
                >
                  <Paperclip size={13} aria-hidden />
                  {attachment.name}
                </a>
              </li>
            ))}
          </ul>
        ) : null}

        {needsAction ? (
          <div className="rounded-lg border border-[hsl(var(--warning-border))] bg-warning-subtle p-3">
            <p className="text-[13px] font-semibold text-default">
              This notice needs your acknowledgement
            </p>
            <p className="mt-0.5 text-[12.5px] text-muted">
              {announcement.acknowledgementDeadline
                ? `Respond by ${formatDateTime(announcement.acknowledgementDeadline)}.`
                : 'Confirm you have read it so the office knows the message reached you.'}
            </p>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-3 pt-0.5">
          <AnnouncementActions
            announcementId={announcement.id}
            requiresAcknowledgement={announcement.requiresAcknowledgement}
            acknowledgedAt={announcement.acknowledgedAt?.toISOString() ?? null}
            readAt={announcement.readAt?.toISOString() ?? null}
          />
          <AskAiLink
            question={`Explain what this notice means for me: "${announcement.title}" (${announcement.reference})`}
          />
        </div>

        {announcement.matchedScope ? (
          <p className="text-[11.5px] text-subtle">
            You received this because it was addressed to your{' '}
            {announcement.matchedScope.toLowerCase()}.
          </p>
        ) : null}
      </CardBody>
    </Card>
  );
}
