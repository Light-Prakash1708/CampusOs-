import { ok, withAuth } from '@/lib/api';
import { getSubjectAttendance } from '@/services/attendance';
import { studentOf, uuidParam } from '../../_lib';

/** One of my subjects: tallies, full history and trend. 404 if not enrolled. */
export const GET = withAuth('attendance:view_own', async (_request, { user, params }) =>
  ok(await getSubjectAttendance(studentOf(user), uuidParam(params.offeringId))),
);
