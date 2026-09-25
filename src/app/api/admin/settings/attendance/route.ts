import { z } from 'zod';
import { ok, parseBody, withAuth } from '@/lib/api';
import { metaFrom } from '@/lib/http';
import { getAttendancePolicy, updateAttendancePolicy } from '@/services/attendance';

const Body = z.object({
  defaultMinimumPct: z.number().min(1).max(100),
  warningMarginPct: z.number().min(0).max(25),
  aggregateMinimumPct: z.number().min(1).max(100).nullable(),
  applyToCurrentTerm: z.boolean().optional(),
});

export const GET = withAuth('attendance:configure', async (_request, { user }) => ok(await getAttendancePolicy(user.institutionId)));

/** Update the college's attendance rules; optionally apply the minimum to every current class. */
export const PUT = withAuth('attendance:configure', async (request, { user }) => {
  const body = await parseBody(request, Body);
  return ok(await updateAttendancePolicy(user, body, metaFrom(request)));
});
