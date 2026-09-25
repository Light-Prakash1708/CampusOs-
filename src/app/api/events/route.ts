import { z } from 'zod';
import { ok, parseBody, withAuth } from '@/lib/api';
import { metaFrom } from '@/lib/http';
import { listEvents } from '@/services/events';
import { createEvent } from '@/services/events/organizer';
import { requireEvents } from './_lib';
import { EventBody } from './_schema';

const Query = z.object({
  tab: z.string().max(30).optional(),
  q: z.string().max(120).optional(),
  city: z.string().max(60).optional(),
  area: z.string().max(80).optional(),
  college: z.string().uuid().optional(),
  mode: z.enum(['OFFLINE', 'ONLINE', 'HYBRID']).optional(),
  free: z.enum(['1', 'true']).optional(),
  certificate: z.enum(['1', 'true']).optional(),
  when: z.enum(['today', 'weekend', 'week', 'month', 'upcoming', 'past']).optional(),
  mine: z.enum(['registered', 'saved', 'college']).optional(),
  radiusKm: z.coerce.number().int().min(1).max(500).optional(),
  sort: z.enum(['relevance', 'date']).optional(),
});

/** Discovery feed (the same query the Events page renders). */
export const GET = withAuth(null, async (request, { user }) => {
  requireEvents(user);
  const q = Query.parse(Object.fromEntries(new URL(request.url).searchParams));
  return ok(await listEvents(user, { ...q, free: !!q.free, certificate: !!q.certificate }));
});

export const POST = withAuth('event:create', async (request, { user }) => {
  requireEvents(user);
  const input = await parseBody(request, EventBody);
  return ok(await createEvent(user, input, metaFrom(request)), { status: 201 });
});
