import { ok, withAuth } from '@/lib/api';
import { listDeletionRequests } from '@/services/privacy';

export const GET = withAuth('privacy:handle_requests', async (_request, { user }) => ok(await listDeletionRequests(user)));
