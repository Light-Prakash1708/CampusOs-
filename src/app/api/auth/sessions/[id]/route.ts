import { z } from 'zod';
import { ok, withAuth } from '@/lib/api';
import { metaFrom } from '@/lib/http';
import { revokeOwnSession } from '@/services/auth/accounts';

export const DELETE = withAuth(null, async (request, { user, params }) => {
  const id = z.string().uuid().parse(params.id);
  await revokeOwnSession(user, id, metaFrom(request));
  return ok({ revoked: id });
});
