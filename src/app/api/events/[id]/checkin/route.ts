import { z } from 'zod';
import { ok, parseBody, withAuth } from '@/lib/api';
import { checkIn } from '@/services/events/organizer';
import { parseId, requireEvents } from '../../_lib';

const Body = z.object({ token: z.string().max(400).optional(), code: z.string().trim().max(20).optional() }).refine((v) => v.token || v.code, { message: 'Scan a pass or type the code.' });

export const POST = withAuth(['event:checkin', 'event:approve', 'event:create'], async (request, { user, params }) => {
  requireEvents(user);
  return ok(await checkIn(user, parseId(params.id), await parseBody(request, Body)));
});
