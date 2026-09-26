import { z } from 'zod';
import { withAuth, ok, parseBody, idParam } from '@/lib/api';
import { transitionGrievance, assignGrievance } from '@/services/grievance';

const Body = z.object({
  to: z.enum([
    'ACKNOWLEDGED', 'ASSIGNED', 'UNDER_REVIEW', 'AWAITING_INFORMATION',
    'RESOLUTION_PROPOSED', 'RESOLVED', 'CLOSED', 'REOPENED', 'WITHDRAWN',
  ]),
  note: z.string().trim().max(2000).optional(),
  resolutionSummary: z.string().trim().max(4000).optional(),
  assignToId: z.string().uuid().optional(),
});

export const POST = withAuth('grievance:view_own', async (request, { user, params }) => {
  const input = await parseBody(request, Body);

  // Reassignment and transition can arrive together (the usual admin action).
  if (input.assignToId) {
    await assignGrievance(user, idParam(params.id, 'That case'), input.assignToId, input.note);
  }

  await transitionGrievance(user, idParam(params.id, 'That case'), {
    to: input.to,
    note: input.note,
    resolutionSummary: input.resolutionSummary,
  });

  return ok({ status: input.to });
});
