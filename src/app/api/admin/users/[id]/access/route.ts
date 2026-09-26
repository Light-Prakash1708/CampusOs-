import { z } from 'zod';
import { idParam, ok, parseBody, withAuth } from '@/lib/api';
import { metaFrom } from '@/lib/http';
import { setUserAccess } from '@/services/auth/accounts';

const Body = z.object({ action: z.enum(['SUSPEND', 'REACTIVATE']) });

/** Suspend or restore a staff member's or student's access (never a super administrator's). */
export const POST = withAuth('user:deactivate', async (request, { user, params }) => {
  const { action } = await parseBody(request, Body);
  await setUserAccess(user, idParam(params.id, 'That person'), action, metaFrom(request));
  return ok({ done: true });
});
