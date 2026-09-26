import { enforceRateLimit, keyFor } from '@/services/rate-limit';
import { z } from 'zod';
import { withAuth, ok, parseBody, idParam } from '@/lib/api';
import { addGrievanceMessage } from '@/services/grievance';

const Body = z.object({
  body: z.string().trim().min(2, 'Write a reply.').max(4000),
  isInternalNote: z.boolean().optional(),
});

export const POST = withAuth('grievance:view_own', async (request, { user, params }) => {
  await enforceRateLimit(keyFor('grievance:message', user.userId), { limit: 60, windowSec: 3600 }, 'Too many requests. Please wait a little and try again.');
  const input = await parseBody(request, Body);
  await addGrievanceMessage(user, idParam(params.id, 'That case'), input.body, input.isInternalNote ?? false);
  return ok({ posted: true });
});
