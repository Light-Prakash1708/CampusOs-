import Link from 'next/link';
import { notFound } from 'next/navigation';
import { and, eq } from 'drizzle-orm';
import { ArrowLeft } from 'lucide-react';
import { db } from '@/lib/db';
import * as t from '@/lib/db/schema';
import { requireAuth } from '@/lib/auth/context';
import { Badge, Card, CardBody, CardHeader, PageHeader, Stat } from '@/components/ui';
import { formatDateTime, humanize } from '@/lib/utils';
import { canSeeReceipts, getNoticeReceipts } from '@/services/notice-receipts';
import { NoticeReceiptsPanel } from '@/components/campus/NoticeReceiptsPanel';

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

  const receipts = canSeeReceipts(user, a.authorId) ? await getNoticeReceipts(user, id) : null;

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
            <ArrowLeft size={13} /> Verified communication
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

        </div>

        <div>
          {receipts ? (
            <NoticeReceiptsPanel r={receipts} part="delivery" />
          ) : (
            <Card>
              <CardHeader title="Reach" />
              <CardBody>
                <Stat label="Recipients" value={a.recipientCount.toLocaleString('en-IN')} />
              </CardBody>
            </Card>
          )}
        </div>
      </div>
      {receipts ? (
        <div className="mt-5">
          <NoticeReceiptsPanel r={receipts} part="pending" />
        </div>
      ) : null}
    </div>
  );
}
