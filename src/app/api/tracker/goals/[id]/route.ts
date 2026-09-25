import { ok, parseBody, withAuth } from '@/lib/api';
import { deleteGoal, updateGoal } from '@/services/tracker';
import { GoalPatch, idParam, studentOnly } from '../../_lib';

export const PATCH = withAuth(null, async (request, { user, params }) => {
  const input = await parseBody(request, GoalPatch);
  return ok(await updateGoal(studentOnly(user), idParam(params.id, 'That goal'), input));
});

export const DELETE = withAuth(null, async (_request, { user, params }) => ok(await deleteGoal(studentOnly(user), idParam(params.id, 'That goal'))));
