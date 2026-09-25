import { z } from 'zod';
import { ok, parseBody, withAuth } from '@/lib/api';
import { decideAttendee } from '@/services/events/organizer';
import { parseId, requireEvents } from '../../../_lib';

const Body = z.object({ approve: z.boolean() });

export const POST = withAuth(['event:create', 'event:approve'], async (request, { user, params }) => {
  requireEvents(user);
  const { approve } = await parseBody(request, Body);
  await decideAttendee(user, parseId(params.id), parseId(params.registrationId), approve);
  return ok({ approved: approve });
});
