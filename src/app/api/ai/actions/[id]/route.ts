import { z } from 'zod';
import { ok, parseBody, withAuth } from '@/lib/api';
import { idParam, metaFrom } from '@/lib/http';
import { decideAction } from '@/services/ai/actions';

const Body = z.object({ decision: z.enum(['confirm', 'dismiss']) });

/** Confirm or dismiss something the assistant prepared. Only the person who asked can. */
export const POST = withAuth('ai:use_assistant', async (request, { user, params }) => {
  const { decision } = await parseBody(request, Body);
  return ok(await decideAction(user, idParam(params.id, 'That suggestion'), decision, metaFrom(request)));
});
