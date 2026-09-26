import { z } from 'zod';
import { idParam, ok, parseBody, withAuth } from '@/lib/api';
import { TRACK_STATUSES, trackOpportunity } from '@/services/opportunities';

const Body = z.object({ status: z.enum([...TRACK_STATUSES, 'NONE']), note: z.string().max(500).nullish() });

/** My private application tracker for one listing. */
export const POST = withAuth('opportunity:view', async (request, { user, params }) => {
  const input = await parseBody(request, Body);
  return ok(await trackOpportunity(user, idParam(params.id, 'That opportunity'), input));
});
