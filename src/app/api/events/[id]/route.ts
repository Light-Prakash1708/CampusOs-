import { ok, parseBody, withAuth } from '@/lib/api';
import { metaFrom } from '@/lib/http';
import { getEvent } from '@/services/events';
import { updateEvent } from '@/services/events/organizer';
import { parseId, requireEvents } from '../_lib';
import { EventBody } from '../_schema';

/** One event as the caller may see it (visibility rules apply; 404 otherwise). */
export const GET = withAuth(null, async (_request, { user, params }) => {
  requireEvents(user);
  return ok(await getEvent(user, parseId(params.id)));
});

/** Edit (organiser or moderator). Time/venue changes are announced automatically. */
export const PATCH = withAuth('event:create', async (request, { user, params }) => {
  requireEvents(user);
  const input = await parseBody(request, EventBody);
  return ok(await updateEvent(user, parseId(params.id), input, metaFrom(request)));
});
