import { z } from 'zod';
import { ok, parseBody, withAuth } from '@/lib/api';
import { metaFrom } from '@/lib/http';
import { startSession } from '@/lib/auth/session';
import { changePassword } from '@/services/auth/accounts';

const Body = z.object({
  currentPassword: z.string().min(1, 'Enter your current password.').max(200),
  newPassword: z.string().min(1, 'Enter a new password.').max(200),
});

/**
 * Changes the password and signs out every device. This device then gets a
 * fresh session so the person is not bounced to the sign-in page.
 */
export const POST = withAuth(null, async (request, { user }) => {
  const input = await parseBody(request, Body);
  const meta = metaFrom(request);
  const { sessionEpoch } = await changePassword(user, { ...input, meta });
  await startSession({ id: user.userId, institutionId: user.institutionId, role: user.role, sessionEpoch }, meta);
  return ok({ message: 'Password changed. Other devices have been signed out.' });
});
