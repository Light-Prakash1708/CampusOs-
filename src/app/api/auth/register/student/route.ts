import { z } from 'zod';
import { ok, parseBody, publicRoute } from '@/lib/api';
import { metaFrom } from '@/lib/http';
import { startSession } from '@/lib/auth/session';
import { registerIndependentStudent } from '@/services/auth/accounts';

/**
 * Student sign-up without a college. Only these fields are read; anything else
 * in the body (a role, an institution or user id) is discarded by the schema.
 * The server assigns the STUDENT role and the student's own new workspace.
 */
const Body = z.object({
  firstName: z.string().trim().min(1, 'Enter your first name.').max(80),
  lastName: z.string().trim().min(1, 'Enter your last name.').max(80),
  email: z.string().trim().toLowerCase().email('Enter a valid email address.').max(200),
  password: z.string().min(1, 'Choose a password.').max(200),
});

export const POST = publicRoute(async (request) => {
  const input = await parseBody(request, Body);
  const meta = metaFrom(request);
  const result = await registerIndependentStudent({ ...input, meta });
  await startSession(result.user, meta);
  return ok({ redirectTo: result.redirectTo }, { status: 201 });
});
