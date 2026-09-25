import { z } from 'zod';
import { ok, withAuth } from '@/lib/api';
import { cancelRegistration, registerForEvent } from '@/services/events';
import { parseId, requireEvents } from '../../_lib';

const Body = z.object({ teamName: z.string().trim().max(80).nullable().optional(), note: z.string().trim().max(500).nullable().optional() });

export const POST = withAuth(null, async (request, { user, params }) => {
  requireEvents(user);
  const body = Body.parse(await request.json().catch(() => ({})));
  return ok(await registerForEvent(user, parseId(params.id), body));
});

export const DELETE = withAuth(null, async (_request, { user, params }) => {
  requireEvents(user);
  return ok(await cancelRegistration(user, parseId(params.id)));
});
