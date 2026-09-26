import { z } from 'zod';
import { ok, parseBody, withAuth, requireFeatureEnabled } from '@/lib/api';
import { metaFrom } from '@/lib/http';
import { moderateEvent } from '@/services/events/organizer';
import { parseId } from '../../_lib';

const Body = z.object({ action: z.enum(['APPROVE', 'REJECT', 'REQUEST_CHANGES', 'SUSPEND']), note: z.string().trim().max(1000).nullable().optional() });

export const POST = withAuth('event:approve', async (request, { user, params }) => {
  requireFeatureEnabled(user, 'events_enabled');
  const input = await parseBody(request, Body);
  await moderateEvent(user, parseId(params.id), input, metaFrom(request));
  return ok({ action: input.action });
});
