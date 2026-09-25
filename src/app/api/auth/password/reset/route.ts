import { z } from 'zod';
import { ok, parseBody, publicRoute } from '@/lib/api';
import { metaFrom } from '@/lib/http';
import { resetPassword } from '@/services/auth/accounts';

const Body = z.object({
  token: z.string().min(20).max(100),
  password: z.string().min(1).max(200),
});

export const POST = publicRoute(async (request) => {
  const input = await parseBody(request, Body);
  await resetPassword({ ...input, meta: metaFrom(request) });
  return ok({ message: 'Your password has been changed. Sign in with your new password.', redirectTo: '/login?reset=1' });
});
