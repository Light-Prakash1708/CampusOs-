import { z } from 'zod';
import { ok, parseBody, publicRoute } from '@/lib/api';
import { metaFrom } from '@/lib/http';
import { requestPasswordReset } from '@/services/auth/accounts';

const Body = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address.'),
  institutionSlug: z.string().trim().max(80).optional(),
});

/** Always answers the same way, so it cannot be used to test which emails have accounts. */
export const POST = publicRoute(async (request) => {
  const input = await parseBody(request, Body);
  await requestPasswordReset({ ...input, meta: metaFrom(request) });
  return ok({
    message: 'If an account exists for that address, we have emailed a link to reset the password. It expires in 30 minutes.',
  });
});
