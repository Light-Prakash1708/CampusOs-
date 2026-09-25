import Link from 'next/link';
import { and, desc, eq } from 'drizzle-orm';
import { Bell } from 'lucide-react';
import { db } from '@/lib/db';
import * as t from '@/lib/db/schema';
import { requireAuth } from '@/lib/auth/context';
import { Badge, Card, EmptyState, PageHeader, Section } from '@/components/ui';
import { humanize, relativeTime } from '@/lib/utils';
import { MarkReadButton } from './MarkReadButton';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Notifications · CampusOS' };

const PRIORITY_TONE: Record<string, 'danger' | 'warning' | 'neutral' | 'outline'> = {
  CRITICAL: 'danger',
  IMPORTANT: 'warning',
  NORMAL: 'neutral',
  INFORMATIONAL: 'outline',
};

export default async function NotificationsPage() {
  const user = await requireAuth();

  const rows = await db
    .select()
    .from(t.notifications)
    .where(
      and(
        eq(t.notifications.userId, user.userId),
        eq(t.notifications.institutionId, user.institutionId),
      ),
    )
    .orderBy(desc(t.notifications.createdAt))
    .limit(100);

  const unreadCount = rows.filter((r) => !r.readAt).length;

  return (
    <div>
      <PageHeader
        title="Notifications"
        description="Everything CampusOS has flagged for your attention."
        action={<MarkReadButton unreadCount={unreadCount} />}
      />

      <Section title={unreadCount > 0 ? `${unreadCount} unread` : 'All read'}>
        <Card>
          {rows.length === 0 ? (
            <EmptyState
              icon={Bell}
              title="No notifications"
              description="Grading queues, timetable changes and notices addressed to you show up here."
            />
          ) : (
            <ul className="divide-y divide-[hsl(var(--border))]">
              {rows.map((n) => {
                const inner = (
                  <>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge tone={PRIORITY_TONE[n.priority] ?? 'neutral'} dot>
                        {n.priority.toLowerCase()}
                      </Badge>
                      <Badge tone="outline">{humanize(n.category)}</Badge>
                      {!n.readAt ? <Badge tone="info">unread</Badge> : null}
                    </div>
                    <p className="mt-1.5 text-[13.5px] font-medium text-default">{n.title}</p>
                    {n.body ? (
                      <p className="mt-0.5 text-[13px] leading-relaxed text-muted">{n.body}</p>
                    ) : null}
                    <p className="mt-1 text-[12px] text-subtle">{relativeTime(n.createdAt)}</p>
                  </>
                );
                return (
                  <li key={n.id} className={n.readAt ? 'px-5 py-3.5' : 'bg-surface-muted px-5 py-3.5'}>
                    {n.actionUrl && n.actionUrl.startsWith('/') ? (
                      <Link href={n.actionUrl} className="block hover:opacity-80">
                        {inner}
                      </Link>
                    ) : (
                      inner
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </Section>
    </div>
  );
}
