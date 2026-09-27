import { z } from 'zod';
import { ok, parseBody, withAuth } from '@/lib/api';
import { metaFrom } from '@/lib/http';
import { confirmEnrollment, disableMfa, mfaStatus, regenerateRecoveryCodes, startEnrollment } from '@/services/auth/mfa';

/** Your own two-step sign-in (CAMPUSOS-018). */
export const GET = withAuth(null, async (_request, { user }) => ok(await mfaStatus(user)));

const Body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('start') }),
  z.object({ action: z.literal('confirm'), code: z.string().trim().max(12) }),
  z.object({ action: z.literal('disable'), code: z.string().trim().max(12).optional(), recoveryCode: z.string().trim().max(24).optional() }),
  z.object({ action: z.literal('regenerate'), code: z.string().trim().max(12) }),
]);

export const POST = withAuth(null, async (request, { user }) => {
  const input = await parseBody(request, Body);
  const meta = metaFrom(request);
  switch (input.action) {
    case 'start':
      return ok(await startEnrollment(user));
    case 'confirm':
      return ok(await confirmEnrollment(user, input.code, meta));
    case 'disable':
      await disableMfa(user, input, meta);
      return ok({ disabled: true });
    case 'regenerate':
      return ok(await regenerateRecoveryCodes(user, input.code, meta));
  }
});
