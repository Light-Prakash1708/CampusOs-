import { z } from 'zod';
import { ok, parseBody, withAuth } from '@/lib/api';
import { metaFrom } from '@/lib/http';
import { cancelEvent } from '@/services/events/organizer';
import { parseId, requireEvents } from '../../_lib';

const Body = z.object({ reason: z.string().trim().min(5, 'Tell attendees why.').max(500) });

/** Cancel (organiser or moderator); registrants, waitlist and followers are told. */
export const POST = withAuth('event:create', async (request, { user, params }) => {
  requireEvents(user);
  const { reason } = await parseBody(request, Body);
  return ok(await cancelEvent(user, parseId(params.id), reason, metaFrom(request)));
});
