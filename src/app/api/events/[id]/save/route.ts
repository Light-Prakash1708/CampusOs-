import { ok, withAuth } from '@/lib/api';
import { setSaved } from '@/services/events';
import { parseId, requireEvents } from '../../_lib';

export const POST = withAuth(null, async (_r, { user, params }) => {
  requireEvents(user);
  return ok(await setSaved(user, parseId(params.id), true));
});
export const DELETE = withAuth(null, async (_r, { user, params }) => {
  requireEvents(user);
  return ok(await setSaved(user, parseId(params.id), false));
});
