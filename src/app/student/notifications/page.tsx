import { Bell } from 'lucide-react';
import { Card, CardBody, EmptyState, PageHeader } from '@/components/ui';
import { humanize } from '@/lib/utils';

import { requireStudentContext } from '../_lib/auth';
import { getStudentNotifications } from '../_lib/campus';
import {
  NotificationGroups,
  type NotificationGroup,
  type NotificationItem,
} from './NotificationGroups';

export const metadata = { title: 'Notifications' };
export const dynamic = 'force-dynamic';

const PRIORITY_ORDER = ['CRITICAL', 'IMPORTANT', 'NORMAL', 'INFORMATIONAL'];

export default async function NotificationsPage() {
  const user = await requireStudentContext();
  const notifications = await getStudentNotifications(user.institutionId, user.userId);

  const buckets = new Map<string, NotificationItem[]>();
  for (const notification of notifications) {
    const key = notification.groupKey ?? '__ungrouped';
    const list = buckets.get(key) ?? [];
    list.push({
      id: notification.id,
      title: notification.title,
      body: notification.body,
      priority: notification.priority,
      category: notification.category,
      actionUrl: notification.actionUrl,
      readAt: notification.readAt?.toISOString() ?? null,
      isMandatory: notification.isMandatory,
      createdAt: notification.createdAt.toISOString(),
    });
    buckets.set(key, list);
  }

  const groups: NotificationGroup[] = [...buckets.entries()]
    .map(([key, items]) => {
      const priority =
        PRIORITY_ORDER.find((p) => items.some((item) => item.priority === p)) ?? 'NORMAL';
      return {
        key,
        label: groupLabel(key, items),
        priority,
        unread: items.filter((item) => !item.readAt).length,
        items,
      };
    })
    // Highest priority first, then most unread, then most recent.
    .sort(
      (a, b) =>
        PRIORITY_ORDER.indexOf(a.priority) - PRIORITY_ORDER.indexOf(b.priority) ||
        b.unread - a.unread ||
        (b.items[0]?.createdAt ?? '').localeCompare(a.items[0]?.createdAt ?? ''),
    );

  const totalUnread = notifications.filter((n) => !n.readAt).length;

  return (
    <>
      <PageHeader
        title="Notifications"
        description="Grouped so related updates arrive as one item, and sorted so the urgent ones stay at the top."
      />

      {notifications.length === 0 ? (
        <Card>
          <CardBody className="p-0">
            <EmptyState
              icon={Bell}
              title="No notifications"
              description="Timetable changes, deadlines, results and notices that need you will show up here."
            />
          </CardBody>
        </Card>
      ) : (
        <NotificationGroups groups={groups} totalUnread={totalUnread} />
      )}
    </>
  );
}

/** "academic-updates" → "Academic Updates"; falls back to the category. */
function groupLabel(key: string, items: NotificationItem[]): string {
  if (key === '__ungrouped') {
    return items.length === 1 ? 'Notification' : 'Other notifications';
  }
  const cleaned = key.replace(/[:_-]+/g, ' ').replace(/\s*\d{4}-\d{2}-\d{2}\s*/g, ' ').trim();
  const label = cleaned
    .split(' ')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
  return label || humanize(items[0]?.category ?? 'GENERAL');
}
