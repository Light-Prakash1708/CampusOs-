import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { Megaphone } from 'lucide-react';
import { db } from '@/lib/db';
import * as t from '@/lib/db/schema';
import { requireAuth, can } from '@/lib/auth/context';
import {
  Badge,
  Card,
  EmptyState,
  PageHeader,
  Section,
  Stat,
} from '@/components/ui';
import { formatDate, formatDateTime, humanize, pluralize, relativeTime } from '@/lib/utils';
import { getCurrentTerm, getMyOfferings } from '../_lib/faculty';
import { AcknowledgeButton } from './AcknowledgeButton';
import { NoticeComposer } from './NoticeComposer';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Announcements · CampusOS' };

const PRIORITY_TONE: Record<string, 'danger' | 'warning' | 'neutral' | 'outline'> = {
  CRITICAL: 'danger',
  IMPORTANT: 'warning',
  NORMAL: 'neutral',
  INFORMATIONAL: 'outline',
};

export default async function AnnouncementsPage() {
  const user = await requireAuth();
  const term = await getCurrentTerm(user.institutionId);

  const addressed = await db
    .select({
      id: t.announcements.id,
      reference: t.announcements.reference,
      title: t.announcements.title,
      body: t.announcements.body,
      summary: t.announcements.summary,
      kind: t.announcements.kind,
      category: t.announcements.category,
      priority: t.announcements.priority,
      requiresAcknowledgement: t.announcements.requiresAcknowledgement,
      acknowledgementDeadline: t.announcements.acknowledgementDeadline,
      publishedAt: t.announcements.publishedAt,
      expiresAt: t.announcements.expiresAt,
      readAt: t.announcementRecipients.readAt,
      acknowledgedAt: t.announcementRecipients.acknowledgedAt,
      authorFirst: t.users.firstName,
      authorLast: t.users.lastName,
    })
    .from(t.announcementRecipients)
    .innerJoin(t.announcements, eq(t.announcements.id, t.announcementRecipients.announcementId))
    .leftJoin(t.users, eq(t.users.id, t.announcements.authorId))
    .where(
      and(
        eq(t.announcementRecipients.userId, user.userId),
        eq(t.announcements.status, 'PUBLISHED'),
        isNull(t.announcements.deletedAt),
      ),
    )
    .orderBy(desc(t.announcements.publishedAt));

  const mine = await db
    .select({
      id: t.announcements.id,
      reference: t.announcements.reference,
      title: t.announcements.title,
      status: t.announcements.status,
      publishedAt: t.announcements.publishedAt,
      recipientCount: t.announcements.recipientCount,
      readCount: t.announcements.readCount,
      acknowledgedCount: t.announcements.acknowledgedCount,
      requiresAcknowledgement: t.announcements.requiresAcknowledgement,
    })
    .from(t.announcements)
    .where(
      and(
        eq(t.announcements.institutionId, user.institutionId),
        eq(t.announcements.authorId, user.userId),
        isNull(t.announcements.deletedAt),
      ),
    )
    .orderBy(desc(t.announcements.createdAt))
    .limit(10);

  const offerings = await getMyOfferings(user, term?.id ?? null);
  const sectionIds = [...new Set(offerings.map((o) => o.sectionId))];
  const sectionCounts = sectionIds.length
    ? await db
        .select({
          sectionId: t.studentProfiles.sectionId,
          students: sql<number>`count(*)::int`,
        })
        .from(t.studentProfiles)
        .where(
          and(
            eq(t.studentProfiles.institutionId, user.institutionId),
            inArray(t.studentProfiles.sectionId, sectionIds),
            isNull(t.studentProfiles.deletedAt),
          ),
        )
        .groupBy(t.studentProfiles.sectionId)
    : [];
  const countBy = new Map(sectionCounts.map((s) => [s.sectionId, s.students]));

  const sections = [
    ...new Map(
      offerings.map((o) => [
        o.sectionId,
        { id: o.sectionId, label: o.sectionCode, students: countBy.get(o.sectionId) ?? 0 },
      ]),
    ).values(),
  ];

  const needsAck = addressed.filter((a) => a.requiresAcknowledgement && !a.acknowledgedAt);
  const unread = addressed.filter((a) => !a.readAt);

  return (
    <div>
      <PageHeader
        title="Announcements"
        description="Notices addressed to you, and the ones you have written."
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Addressed to you" value={addressed.length} icon={Megaphone} />
        <Stat label="Unread" value={unread.length} tone={unread.length > 0 ? 'warning' : 'neutral'} />
        <Stat
          label="Awaiting your acknowledgement"
          value={needsAck.length}
          tone={needsAck.length > 0 ? 'danger' : 'success'}
        />
        <Stat label="Written by you" value={mine.length} />
      </div>

      {can(user, 'announcement:create_informational') ? (
        <Section title="Write a notice">
          <NoticeComposer sections={sections} />
        </Section>
      ) : null}

      {needsAck.length > 0 ? (
        <Section
          title="Needs your acknowledgement"
          description="Confirming is recorded against your account with a timestamp."
        >
          <Card>
            <ul className="divide-y divide-[hsl(var(--border))]">
              {needsAck.map((a) => (
                <NoticeRow key={a.id} notice={a} showAck />
              ))}
            </ul>
          </Card>
        </Section>
      ) : null}

      <Section title="All notices addressed to you">
        <Card>
          {addressed.length === 0 ? (
            <EmptyState
              icon={Megaphone}
              title="No notices are addressed to you"
              description="Notices reach you based on your role, department and the sections you teach."
            />
          ) : (
            <ul className="divide-y divide-[hsl(var(--border))]">
              {addressed.map((a) => (
                <NoticeRow key={a.id} notice={a} showAck={a.requiresAcknowledgement} />
              ))}
            </ul>
          )}
        </Card>
      </Section>

      {mine.length > 0 ? (
        <Section title="Notices you have written">
          <Card>
            <ul className="divide-y divide-[hsl(var(--border))]">
              {mine.map((a) => (
                <li
                  key={a.id}
                  className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-[13.5px] font-medium text-default">{a.title}</p>
                    <p className="text-[12.5px] text-muted">
                      {a.reference} ·{' '}
                      {a.publishedAt ? `published ${formatDate(a.publishedAt)}` : 'not published'} ·{' '}
                      {pluralize(a.recipientCount, 'recipient')} · {a.readCount} read
                      {a.requiresAcknowledgement
                        ? ` · ${a.acknowledgedCount} acknowledged`
                        : ''}
                    </p>
                  </div>
                  <Badge tone={a.status === 'PUBLISHED' ? 'success' : 'neutral'}>
                    {humanize(a.status)}
                  </Badge>
                </li>
              ))}
            </ul>
          </Card>
        </Section>
      ) : null}
    </div>
  );
}

interface NoticeRowData {
  id: string;
  reference: string;
  title: string;
  body: string;
  summary: string | null;
  kind: string;
  category: string;
  priority: string;
  requiresAcknowledgement: boolean;
  acknowledgementDeadline: Date | null;
  publishedAt: Date | null;
  expiresAt: Date | null;
  readAt: Date | null;
  acknowledgedAt: Date | null;
  authorFirst: string | null;
  authorLast: string | null;
}

function NoticeRow({ notice, showAck }: { notice: NoticeRowData; showAck: boolean }) {
  return (
    <li className="px-5 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge tone={PRIORITY_TONE[notice.priority] ?? 'neutral'} dot>
              {notice.priority.toLowerCase()}
            </Badge>
            <Badge tone="outline">{humanize(notice.category)}</Badge>
            {notice.kind === 'OFFICIAL' ? <Badge tone="brand">official</Badge> : null}
            {!notice.readAt ? <Badge tone="info">new</Badge> : null}
          </div>
          <p className="mt-1.5 text-[14px] font-medium leading-snug text-default">
            {notice.title}
          </p>
          <p className="mt-1 whitespace-pre-wrap text-[13px] leading-relaxed text-default">
            {notice.body}
          </p>
          <p className="mt-1.5 text-[12px] text-subtle">
            {notice.reference}
            {notice.authorFirst ? ` · ${notice.authorFirst} ${notice.authorLast}` : ''}
            {notice.publishedAt ? ` · ${relativeTime(notice.publishedAt)}` : ''}
            {notice.acknowledgementDeadline
              ? ` · acknowledge by ${formatDateTime(notice.acknowledgementDeadline)}`
              : ''}
          </p>
        </div>
        {showAck ? (
          <AcknowledgeButton
            announcementId={notice.id}
            acknowledgedAt={notice.acknowledgedAt ? notice.acknowledgedAt.toISOString() : null}
          />
        ) : null}
      </div>
    </li>
  );
}
