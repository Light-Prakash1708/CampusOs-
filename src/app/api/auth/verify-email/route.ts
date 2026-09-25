import { z } from 'zod';
import { ok, parseBody, publicRoute } from '@/lib/api';
import { metaFrom } from '@/lib/http';
import { verifyEmail } from '@/services/auth/accounts';

const Body = z.object({ token: z.string().min(20).max(100) });

const MESSAGES = {
  ACTIVE: 'Email confirmed. Your account is ready — sign in to get started.',
  AWAITING_APPROVAL: 'Email confirmed. Your college reviews new registrations; we will email you once it is approved.',
  ALREADY_ACTIVE: 'Email confirmed.',
} as const;

export const POST = publicRoute(async (request) => {
  const { token } = await parseBody(request, Body);
  const outcome = await verifyEmail({ token, meta: metaFrom(request) });
  return ok({ outcome, message: MESSAGES[outcome] });
});
