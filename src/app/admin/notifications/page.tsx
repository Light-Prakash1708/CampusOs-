import { and, desc, eq } from 'drizzle-orm';
import { Bell } from 'lucide-react';
import { db } from '@/lib/db';
import * as t from '@/lib/db/schema';
import { requireAuth } from '@/lib/auth/context';
import { Badge, Card, CardBody, EmptyState, PageHeader } from '@/components/ui';
import { humanize, relativeTime } from '@/lib/utils';
import Link from 'next/link';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Notifications · CampusOS' };

export default async function AdminNotificationsPage() {
  const user = await requireAuth();

  const rows = await db
    .select()
    .from(t.notifications)
    .where(eq(t.notifications.userId, user.userId))
    .orderBy(desc(t.notifications.createdAt))
    .limit(80);

  // Group by groupKey so 15 related updates read as one line, not fifteen.
  const groups = rows.reduce<Record<string, typeof rows>>((acc, n) => {
    (acc[n.groupKey ?? 'other'] ??= []).push(n);
    return acc;
  }, {});

  return (
    <div>
      <PageHeader title="Notifications" description={`${rows.length} most recent`} />

      {rows.length === 0 ? (
        <Card>
          <EmptyState icon={Bell} title="Nothing yet" description="Alerts about conflicts, cases and approvals arrive here." />
        </Card>
      ) : (
        <div className="space-y-5">
          {Object.entries(groups).map(([key, items]) => (
            <section key={key}>
              <h2 className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-subtle">
                {humanize(key)} ({items.length})
              </h2>
              <Card>
                <CardBody className="p-0">
                  {items.map((n) => {
                    const inner = (
                      <>
                        <div className="flex items-start justify-between gap-3">
                          <p className="text-[13.5px] font-medium text-default">{n.title}</p>
                          {!n.readAt ? <Badge tone="brand">New</Badge> : null}
                        </div>
                        {n.body ? <p className="mt-0.5 text-[13px] text-muted">{n.body}</p> : null}
                        <p className="mt-1 text-[11.5px] text-subtle">
                          {humanize(n.priority)} · {relativeTime(n.createdAt)}
                        </p>
                      </>
                    );
                    return n.actionUrl ? (
                      <Link
                        key={n.id}
                        href={n.actionUrl}
                        className="block border-b border-[hsl(var(--border))] px-5 py-3 last:border-0 hover:bg-surface-sunken"
                      >
                        {inner}
                      </Link>
                    ) : (
                      <div key={n.id} className="border-b border-[hsl(var(--border))] px-5 py-3 last:border-0">
                        {inner}
                      </div>
                    );
                  })}
                </CardBody>
              </Card>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
