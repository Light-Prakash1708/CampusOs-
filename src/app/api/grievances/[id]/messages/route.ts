import { z } from 'zod';
import { withAuth, ok, parseBody } from '@/lib/api';
import { addGrievanceMessage } from '@/services/grievance';

const Body = z.object({
  body: z.string().trim().min(2, 'Write a reply.').max(4000),
  isInternalNote: z.boolean().optional(),
});

export const POST = withAuth('grievance:view_own', async (request, { user, params }) => {
  const input = await parseBody(request, Body);
  await addGrievanceMessage(user, params.id!, input.body, input.isInternalNote ?? false);
  return ok({ posted: true });
});
