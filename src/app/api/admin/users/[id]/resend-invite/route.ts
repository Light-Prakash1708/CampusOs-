import { z } from 'zod';
import { ok, withAuth } from '@/lib/api';
import { metaFrom } from '@/lib/http';
import { resendInvite } from '@/services/auth/accounts';

export const POST = withAuth('user:invite', async (request, { user, params }) => {
  const id = z.string().uuid().parse(params.id);
  return ok(await resendInvite(user, id, metaFrom(request)));
});
