import { enforceRateLimit, keyFor } from '@/services/rate-limit';
import { ok, withAuth } from '@/lib/api';
import { setSaved } from '@/services/events';
import { parseId, requireEvents } from '../../_lib';

export const POST = withAuth(null, async (_r, { user, params }) => {
  await enforceRateLimit(keyFor('event:save', user.userId), { limit: 300, windowSec: 3600 }, 'Too many requests. Please wait a little and try again.');
  requireEvents(user);
  return ok(await setSaved(user, parseId(params.id), true));
});
export const DELETE = withAuth(null, async (_r, { user, params }) => {
  requireEvents(user);
  return ok(await setSaved(user, parseId(params.id), false));
});
