import { ok, parseBody, withAuth } from '@/lib/api';
import { createGoal } from '@/services/tracker';
import { GoalBody, studentOnly } from '../_lib';

export const POST = withAuth(null, async (request, { user }) => {
  const input = await parseBody(request, GoalBody);
  return ok(await createGoal(studentOnly(user), input), { status: 201 });
});
