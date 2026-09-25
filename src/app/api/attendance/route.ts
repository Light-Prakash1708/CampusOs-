import { ok, withAuth } from '@/lib/api';
import { getAttendanceOverview } from '@/services/attendance';
import { studentOf } from './_lib';

/** My attendance: subjects, overall, weekly trend, risk states and advice. */
export const GET = withAuth('attendance:view_own', async (_request, { user }) => ok(await getAttendanceOverview(studentOf(user))));
