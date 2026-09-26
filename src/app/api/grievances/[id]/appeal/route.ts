import { z } from 'zod';
import { idParam, ok, parseBody, withAuth } from '@/lib/api';
import { appealGrievance } from '@/services/grievance';

const Body = z.object({ reason: z.string().trim().min(10, 'Please explain why you are appealing.').max(2000) });

/** The raiser appeals the SGRC decision to the Ombudsperson (CAMPUSOS-011). */
export const POST = withAuth('grievance:view_own', async (request, { user, params }) => {
  const input = await parseBody(request, Body);
  return ok(await appealGrievance(user, idParam(params.id, 'That case'), input));
});
