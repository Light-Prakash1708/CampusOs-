import { ok, withAuth } from '@/lib/api';
import { listSessions } from '@/services/auth/accounts';

export const GET = withAuth(null, async (_request, { user }) => ok(await listSessions(user)));
