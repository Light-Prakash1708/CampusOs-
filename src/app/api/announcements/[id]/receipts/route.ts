import { idParam, ok, withAuth } from '@/lib/api';
import { metaFrom } from '@/lib/http';
import { exportPendingCsv, getNoticeReceipts } from '@/services/notice-receipts';

/**
 * Delivery and acknowledgement proof for one notice (CAMPUSOS-010).
 * GET → JSON. GET ?format=csv → the not-yet-acknowledged list as CSV (audited).
 * Sender or `announcement:view_analytics` only; enforced in the service.
 */
export const GET = withAuth(null, async (request, { user, params }) => {
  const id = idParam(params.id, 'That notice');
  if (new URL(request.url).searchParams.get('format') === 'csv') {
    const { filename, csv } = await exportPendingCsv(user, id, metaFrom(request));
    return new Response(csv, {
      status: 200,
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="${filename.replace(/[^A-Za-z0-9._-]/g, '_')}"`,
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff',
      },
    });
  }
  return ok(await getNoticeReceipts(user, id));
});
