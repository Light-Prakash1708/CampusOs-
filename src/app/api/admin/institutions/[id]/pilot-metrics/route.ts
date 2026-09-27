import { idParam, withAuth } from '@/lib/api';
import { metaFrom } from '@/lib/http';
import { parseRange } from '@/services/campus-evidence';
import { exportPilotMetrics } from '@/services/pilot-metrics';

/**
 * GET /api/admin/institutions/[id]/pilot-metrics?from=YYYY-MM-DD&to=YYYY-MM-DD
 * Weekly pilot evidence for one college as CSV. Platform operators only
 * (checked in the service); aggregates only; audited.
 */
export const GET = withAuth(null, async (request, { user, params }) => {
  const id = idParam(params.id, 'That institution');
  const url = new URL(request.url);
  const range = parseRange(url.searchParams.get('from'), url.searchParams.get('to'));
  const { filename, csv } = await exportPilotMetrics(user, id, range, metaFrom(request));
  return new Response(csv, {
    status: 200,
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="${filename}"`,
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    },
  });
});
