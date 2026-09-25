import { ok, parseBody, withAuth } from '@/lib/api';
import { deleteTask, updateTask } from '@/services/tracker';
import { idParam, studentOnly, TaskPatch } from '../../_lib';

export const PATCH = withAuth(null, async (request, { user, params }) => {
  const input = await parseBody(request, TaskPatch);
  return ok(await updateTask(studentOnly(user), idParam(params.id, 'That task'), input));
});

export const DELETE = withAuth(null, async (_request, { user, params }) => ok(await deleteTask(studentOnly(user), idParam(params.id, 'That task'))));
