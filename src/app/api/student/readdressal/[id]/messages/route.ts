import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import * as t from '@/lib/db/schema';
import { NotFoundError, ok, parseBody, withAuth } from '@/lib/api';
import { addGrievanceMessage } from '@/services/grievance';

/**
 * Posts a student reply on their own readdressal case.
 *
 * The heavy lifting (authorisation, first-response tracking, notifying the
 * handler) lives in the grievance service. This route adds the student-portal
 * guarantee that a reply is never an internal note.
 */

const Body = z.object({
  body: z.string().trim().min(2, 'Write your reply before sending.').max(4000),
});

export const POST = withAuth('grievance:view_own', async (request, { user, params }) => {
  const grievanceId = params.id;
  const input = await parseBody(request, Body);

  const [grievance] = await db
    .select({ id: t.grievances.id, status: t.grievances.status })
    .from(t.grievances)
    .where(
      and(eq(t.grievances.id, grievanceId), eq(t.grievances.institutionId, user.institutionId)),
    )
    .limit(1);

  if (!grievance) throw new NotFoundError('Case');

  // `addGrievanceMessage` enforces that the caller is the raiser or a handler.
  await addGrievanceMessage(user, grievanceId, input.body, false);

  return ok({ posted: true });
});
