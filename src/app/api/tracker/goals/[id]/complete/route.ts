import { ok, withAuth } from '@/lib/api';
import { completeGoal } from '@/services/tracker';
import { idParam, studentOnly } from '../../../_lib';

export const POST = withAuth(null, async (_request, { user, params }) => ok(await completeGoal(studentOnly(user), idParam(params.id, 'That goal'))));
