import { z } from 'zod';
import { ok, parseBody, publicRoute } from '@/lib/api';
import { metaFrom } from '@/lib/http';
import { startSession } from '@/lib/auth/session';
import { acceptInvite } from '@/services/auth/accounts';

const Body = z.object({
  token: z.string().min(20).max(100),
  password: z.string().min(1, 'Choose a password.').max(200),
});

export const POST = publicRoute(async (request) => {
  const input = await parseBody(request, Body);
  const meta = metaFrom(request);
  const user = await acceptInvite({ ...input, meta });
  await startSession(user, meta);
  return ok({ redirectTo: user.redirectTo });
});
