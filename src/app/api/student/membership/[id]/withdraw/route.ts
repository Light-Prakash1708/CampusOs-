import { idParam, ok, withAuth } from '@/lib/api';
import { metaFrom } from '@/lib/http';
import { withdrawMembershipRequest } from '@/services/membership';

export const POST = withAuth(null, async (request, { user, params }) => {
  await withdrawMembershipRequest(user, idParam(params.id, 'That request'), metaFrom(request));
  return ok({ done: true });
});
