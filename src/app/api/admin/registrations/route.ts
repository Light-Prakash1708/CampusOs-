import { ok, withAuth } from '@/lib/api';
import { listPendingRegistrations } from '@/services/auth/accounts';

export const GET = withAuth('user:approve_registration', async (_request, { user }) =>
  ok(await listPendingRegistrations(user)),
);
