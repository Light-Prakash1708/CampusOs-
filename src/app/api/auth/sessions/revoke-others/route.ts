import { ok, withAuth } from '@/lib/api';
import { metaFrom } from '@/lib/http';
import { revokeOtherSessions } from '@/services/auth/accounts';

export const POST = withAuth(null, async (request, { user }) => {
  const count = await revokeOtherSessions(user, metaFrom(request));
  return ok({ revoked: count });
});
