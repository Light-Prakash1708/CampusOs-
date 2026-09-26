import { z } from 'zod';
import { idParam, ok, parseBody, withAuth } from '@/lib/api';
import { metaFrom } from '@/lib/http';
import { moderateOpportunity } from '@/services/opportunities';

const Body = z.object({ action: z.enum(['APPROVE', 'REJECT', 'CLOSE']), note: z.string().max(500).nullish() });

export const POST = withAuth('opportunity:manage', async (request, { user, params }) => {
  const input = await parseBody(request, Body);
  return ok(await moderateOpportunity(user, idParam(params.id, 'That opportunity'), input, metaFrom(request)));
});
