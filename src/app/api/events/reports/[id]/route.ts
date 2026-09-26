import { z } from 'zod';
import { ok, parseBody, withAuth, requireFeatureEnabled } from '@/lib/api';
import { resolveReport } from '@/services/events/organizer';
import { parseId } from '../../_lib';

const Body = z.object({ action: z.enum(['DISMISS', 'ACTIONED']) });

export const POST = withAuth('event:approve', async (request, { user, params }) => {
  requireFeatureEnabled(user, 'events_enabled');
  const { action } = await parseBody(request, Body);
  await resolveReport(user, parseId(params.id), action);
  return ok({ action });
});
