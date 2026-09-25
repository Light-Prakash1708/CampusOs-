import { z } from 'zod';
import { ok, parseBody, withAuth } from '@/lib/api';
import { metaFrom } from '@/lib/http';
import { requestDeletion } from '@/services/privacy';

const Body = z.object({
  scope: z.enum(['ACCOUNT', 'PERSONAL_TRACKER', 'AI_MEMORY']),
  reason: z.string().trim().max(1000).nullable().optional(),
  /** The UI makes people type this for account deletion; the API insists too. */
  confirm: z.literal('DELETE').optional(),
});

export const POST = withAuth('privacy:manage_own', async (request, { user }) => {
  const input = await parseBody(request, Body);
  if (input.scope === 'ACCOUNT' && input.confirm !== 'DELETE') {
    return ok({ status: 'CONFIRMATION_REQUIRED' }, { status: 400 });
  }
  return ok(await requestDeletion(user, input, metaFrom(request)), { status: input.scope === 'ACCOUNT' ? 202 : 200 });
});
