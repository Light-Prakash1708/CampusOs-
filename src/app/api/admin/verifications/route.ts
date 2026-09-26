import { ok, withAuth } from '@/lib/api';
import { listMembershipRequests, REQUEST_STATUSES, type RequestStatus } from '@/services/membership';

export const GET = withAuth('user:approve_registration', async (request, { user }) => {
  const url = new URL(request.url);
  const raw = url.searchParams.get('status') ?? 'OPEN';
  const status = raw === 'OPEN' || (REQUEST_STATUSES as readonly string[]).includes(raw) ? (raw as RequestStatus | 'OPEN') : 'OPEN';
  const page = Number(url.searchParams.get('page') ?? 1) || 1;
  return ok(await listMembershipRequests(user, { status, page }));
});
