import { z } from 'zod';
import { ok, parseBody, withAuth } from '@/lib/api';
import { addStep } from '@/services/tracker';
import { idParam, studentOnly, Title } from '../../../_lib';

export const POST = withAuth(null, async (request, { user, params }) => {
  const { title } = await parseBody(request, z.object({ title: Title }));
  return ok(await addStep(studentOnly(user), idParam(params.id, 'That goal'), title), { status: 201 });
});
