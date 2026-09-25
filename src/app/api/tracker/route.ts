import { ok, withAuth } from '@/lib/api';
import { getTrackerOverview } from '@/services/tracker';
import { studentOnly } from './_lib';

/** My goals (with streaks and progress), tasks and activity heatmap. */
export const GET = withAuth(null, async (_request, { user }) => ok(await getTrackerOverview(studentOnly(user))));
