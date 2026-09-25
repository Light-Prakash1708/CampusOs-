import { z } from 'zod';
import { withAuth, ok, parseBody } from '@/lib/api';
import { publishTimetable } from '@/services/timetable/generate';

const Body = z.object({
  versionId: z.string().uuid(),
  reason: z.string().trim().min(5, 'Give a reason — it is shown to everyone affected.').max(500),
});

/**
 * Publishes a timetable version. Computes the diff against the previously
 * published one and records change events so affected people are told what
 * moved and why.
 */
export const POST = withAuth('timetable:publish', async (request, { user }) => {
  const { versionId, reason } = await parseBody(request, Body);
  const diff = await publishTimetable(user, { versionId, reason });
  return ok(diff);
});
