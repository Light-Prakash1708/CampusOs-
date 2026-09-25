import { z } from 'zod';
import { ok, parseBody, publicRoute } from '@/lib/api';
import { metaFrom } from '@/lib/http';
import { resendVerification } from '@/services/auth/accounts';

const Body = z.object({ email: z.string().trim().toLowerCase().email('Enter a valid email address.') });

export const POST = publicRoute(async (request) => {
  const { email } = await parseBody(request, Body);
  await resendVerification({ email, meta: metaFrom(request) });
  return ok({ message: 'If that address is waiting for confirmation, a new link is on its way.' });
});
