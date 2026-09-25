import { ok, parseBody, withAuth } from '@/lib/api';
import { createTask } from '@/services/tracker';
import { studentOnly, TaskBody } from '../_lib';

export const POST = withAuth(null, async (request, { user }) => {
  const input = await parseBody(request, TaskBody);
  return ok(await createTask(studentOnly(user), input), { status: 201 });
});
