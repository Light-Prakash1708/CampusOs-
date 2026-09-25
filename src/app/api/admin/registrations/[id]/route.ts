import { z } from 'zod';
import { ok, parseBody, withAuth } from '@/lib/api';
import { metaFrom } from '@/lib/http';
import { decideRegistration } from '@/services/auth/accounts';

const Body = z.object({ approve: z.boolean(), note: z.string().trim().max(500).nullable().optional() });

export const POST = withAuth('user:approve_registration', async (request, { user, params }) => {
  const userId = z.string().uuid().parse(params.id);
  const input = await parseBody(request, Body);
  const result = await decideRegistration(user, { userId, ...input, meta: metaFrom(request) });
  return ok({ id: result.id, approved: input.approve });
});
