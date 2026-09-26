import { withAuth } from '@/lib/api';
import { metaFrom } from '@/lib/http';
import { exportEvidencePack, parseRange } from '@/services/campus-evidence';

/**
 * The evidence pack (CAMPUSOS-014): a ZIP of summary.html + CSVs.
 * GET /api/reports/evidence?from=YYYY-MM-DD&to=YYYY-MM-DD[&individual=1]
 * Aggregates only unless `individual=1` and the caller holds data:export.
 * Audited (EVIDENCE_PACK_EXPORTED).
 */
export const GET = withAuth('report:generate', async (request, { user }) => {
  const url = new URL(request.url);
  const range = parseRange(url.searchParams.get('from'), url.searchParams.get('to'));
  const { filename, bytes } = await exportEvidencePack(user, { range, individual: url.searchParams.get('individual') === '1' }, metaFrom(request));
  return new Response(Buffer.from(bytes), {
    status: 200,
    headers: {
      'content-type': 'application/zip',
      'content-disposition': `attachment; filename="${filename}"`,
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    },
  });
});
