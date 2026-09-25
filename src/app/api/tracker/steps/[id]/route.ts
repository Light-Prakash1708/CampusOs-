import { z } from 'zod';
import { ok, parseBody, withAuth } from '@/lib/api';
import { deleteStep, setStepDone } from '@/services/tracker';
import { idParam, studentOnly } from '../../_lib';

export const PATCH = withAuth(null, async (request, { user, params }) => {
  const { done } = await parseBody(request, z.object({ done: z.boolean() }));
  return ok(await setStepDone(studentOnly(user), idParam(params.id, 'That step'), done));
});

export const DELETE = withAuth(null, async (_request, { user, params }) => ok(await deleteStep(studentOnly(user), idParam(params.id, 'That step'))));
