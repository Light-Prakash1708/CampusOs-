import { ok, withAuth, AppError } from '@/lib/api';
import { computeLeaveImpact } from '../../_lib/leave';

/** Preview only — writes nothing. The submit route recomputes it identically. */
export const GET = withAuth('leave:request', async (request, { user }) => {
  const url = new URL(request.url);
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');

  if (!from || !to || !/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    throw new AppError('A start and end date (YYYY-MM-DD) are required.', 400, 'MISSING_DATES');
  }

  const impact = await computeLeaveImpact(user, from, to);
  return ok(impact);
});

export const dynamic = 'force-dynamic';
