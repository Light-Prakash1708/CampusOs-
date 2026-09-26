import { idParam, ok, withAuth } from '@/lib/api';
import { deleteConversation, getConversation } from '@/services/ai/conversations';

export const GET = withAuth('ai:use_assistant', async (_request, { user, params }) => ok(await getConversation(user, idParam(params.id, 'That conversation'))));

export const DELETE = withAuth('ai:use_assistant', async (_request, { user, params }) => ok(await deleteConversation(user, idParam(params.id, 'That conversation'))));
