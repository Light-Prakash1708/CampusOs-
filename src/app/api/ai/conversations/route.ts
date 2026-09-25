import { ok, withAuth } from '@/lib/api';
import { deleteAllConversations, listConversations } from '@/services/ai/conversations';

/** My assistant conversations, newest first. */
export const GET = withAuth('ai:use_assistant', async (_request, { user }) => ok(await listConversations(user)));

/** Delete all of my assistant history. */
export const DELETE = withAuth('ai:use_assistant', async (_request, { user }) => ok(await deleteAllConversations(user)));
