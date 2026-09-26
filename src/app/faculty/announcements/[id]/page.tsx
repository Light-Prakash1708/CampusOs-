import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { requireAuth } from '@/lib/auth/context';
import { Card, CardBody, PageHeader } from '@/components/ui';
import { formatDateTime } from '@/lib/utils';
import { getNoticeReceipts } from '@/services/notice-receipts';
import { NoticeReceiptsPanel } from '@/components/campus/NoticeReceiptsPanel';
import { AppError } from '@/lib/api';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Notice receipts' };

/** A faculty member's own notice: who received, opened and acknowledged it. */
export default async function FacultyNoticeReceiptsPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireAuth();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const receipts = await getNoticeReceipts(user, id).catch((error: unknown) => {
    if (error instanceof AppError && (error.status === 404 || error.status === 403)) return null;
    throw error;
  });
  if (!receipts) notFound();

  return (
    <div>
      <PageHeader
        title={receipts.title}
        description={`${receipts.reference}${receipts.publishedAt ? ` · published ${formatDateTime(receipts.publishedAt)}` : ''}`}
        breadcrumb={
          <Link href="/faculty/announcements" className="inline-flex items-center gap-1 text-[12.5px] text-muted hover:text-default">
            <ArrowLeft size={13} /> Announcements
          </Link>
        }
      />
      {receipts.funnel.recipients === 0 ? (
        <Card>
          <CardBody>
            <p className="text-[13.5px] text-muted">This notice has not been delivered to anyone yet.</p>
          </CardBody>
        </Card>
      ) : (
        <div className="grid gap-5 lg:grid-cols-3">
          <div className="lg:col-span-1">
            <NoticeReceiptsPanel r={receipts} part="delivery" />
          </div>
          <div className="lg:col-span-2">
            <NoticeReceiptsPanel r={receipts} part="pending" />
          </div>
        </div>
      )}
    </div>
  );
}
