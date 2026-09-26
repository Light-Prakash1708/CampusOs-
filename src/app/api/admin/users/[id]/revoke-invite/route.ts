import { idParam, ok, withAuth } from '@/lib/api';
import { metaFrom } from '@/lib/http';
import { revokeInvite } from '@/services/auth/accounts';

/** Withdraws an unaccepted invitation: its link stops working immediately. */
export const POST = withAuth('user:invite', async (request, { user, params }) => {
  await revokeInvite(user, idParam(params.id, 'That invitation'), metaFrom(request));
  return ok({ done: true });
});
