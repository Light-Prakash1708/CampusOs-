import { z } from 'zod';
import { ok, parseBody, withAuth } from '@/lib/api';
import { metaFrom } from '@/lib/http';
import { decideDeletionRequest } from '@/services/privacy';

const Body = z.object({ approve: z.boolean(), note: z.string().trim().max(1000).nullable().optional() });

export const POST = withAuth('privacy:handle_requests', async (request, { user, params }) => {
  const requestId = z.string().uuid().parse(params.id);
  const input = await parseBody(request, Body);
  await decideDeletionRequest(user, { requestId, ...input }, metaFrom(request));
  return ok({ id: requestId, approved: input.approve });
});
