import { z } from 'zod';
import { ok, parseBody, withAuth } from '@/lib/api';
import { setCareerGoal } from '@/services/opportunities';

const Body = z.object({ careerRoleId: z.string().uuid().nullable() });

/** Set (or clear) my own primary career goal from the college's role catalogue. */
export const POST = withAuth('skill:view_own', async (request, { user }) => {
  const { careerRoleId } = await parseBody(request, Body);
  return ok(await setCareerGoal(user, careerRoleId));
});
