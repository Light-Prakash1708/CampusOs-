import { z } from 'zod';
import { ok, parseBody, withAuth } from '@/lib/api';
import { COLLEGE_REQUEST_STATUSES, setCollegeRequestStatus } from '@/services/college-requests';

const Body = z.object({ status: z.enum(COLLEGE_REQUEST_STATUSES) });

/** Platform operators triage "Register your college" requests. */
export const PATCH = withAuth(null, async (request, { user, params }) => {
  const id = z.string().uuid().parse(params.id);
  const { status } = await parseBody(request, Body);
  return ok(await setCollegeRequestStatus(user, id, status));
});
