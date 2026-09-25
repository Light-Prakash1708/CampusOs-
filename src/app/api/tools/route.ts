import { ok, withAuth } from '@/lib/api';
import { listToolsFor } from '@/services/tools';

/** The Tools & Utilities hub for the signed-in user: status and personal order. */
export const GET = withAuth(null, async (_request, { user }) => ok({ tools: await listToolsFor(user) }));
