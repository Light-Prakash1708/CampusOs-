import { z } from 'zod';
import { ok, parseBody, withAuth } from '@/lib/api';
import { metaFrom } from '@/lib/http';
import { postEventUpdate } from '@/services/events/organizer';
import { parseId, requireEvents } from '../../_lib';

const Body = z.object({
  kind: z.enum(['REGISTRATION_OPEN', 'REMINDER', 'VENUE_CHANGED', 'TIME_CHANGED', 'RESULTS', 'EMERGENCY', 'CERTIFICATES', 'GENERAL']),
  title: z.string().trim().min(3).max(140),
  body: z.string().trim().max(2000).nullable().optional(),
  audience: z.enum(['REGISTERED', 'FOLLOWERS']).default('FOLLOWERS'),
});

export const POST = withAuth(['event:create', 'event:approve'], async (request, { user, params }) => {
  requireEvents(user);
  return ok(await postEventUpdate(user, parseId(params.id), await parseBody(request, Body), metaFrom(request)), { status: 201 });
});
