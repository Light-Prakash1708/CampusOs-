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
  /** An age band, never a date of birth (CAMPUSOS-005). */
  ageBand: z.enum(['UNDER_18', '18_OR_OVER'], { message: 'Tell us whether you are 18 or older.' }),
  acceptPrivacyNotice: z.literal(true, { message: 'Please read and accept the privacy notice.' }),
});

export const POST = publicRoute(async (request) => {
  const input = await parseBody(request, Body);
  const meta = metaFrom(request);
  const { acceptPrivacyNotice: _accepted, ...rest } = input;
  const result = await registerIndependentStudent({ ...rest, meta });
  await startSession(result.user, meta);
  return ok({ redirectTo: result.redirectTo }, { status: 201 });
});
