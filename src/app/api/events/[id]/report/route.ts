import { z } from 'zod';
import { ok, parseBody, withAuth } from '@/lib/api';
import { reportEvent } from '@/services/events';
import { parseId, requireEvents } from '../../_lib';

const Body = z.object({ reason: z.enum(['FAKE', 'SPAM', 'WRONG_DETAILS', 'INAPPROPRIATE', 'OTHER']), details: z.string().trim().max(1000).nullable().optional() });

export const POST = withAuth(null, async (request, { user, params }) => {
  requireEvents(user);
  return ok(await reportEvent(user, parseId(params.id), await parseBody(request, Body)));
});
