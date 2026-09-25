import { ok, parseBody, withAuth } from '@/lib/api';
import { checkInGoal, undoCheckIn } from '@/services/tracker';
import { CheckinBody, idParam, studentOnly } from '../../../_lib';

/** Log a check-in for today (or yesterday). */
export const POST = withAuth(null, async (request, { user, params }) => {
  const input = await parseBody(request, CheckinBody);
  return ok(await checkInGoal(studentOnly(user), idParam(params.id, 'That goal'), input));
});

/** Undo the last check-in (`?day=yesterday` for yesterday's). */
export const DELETE = withAuth(null, async (request, { user, params }) => {
  const day = new URL(request.url).searchParams.get('day') === 'yesterday' ? 'yesterday' : 'today';
  return ok(await undoCheckIn(studentOnly(user), idParam(params.id, 'That goal'), day));
});
