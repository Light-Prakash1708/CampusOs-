import { withAuth, ok, idParam } from '@/lib/api';
import { markAnnouncementRead } from '@/services/communication';

/** Marks a notice as read. Idempotent — repeated calls do not inflate counts. */
export const POST = withAuth(null, async (_request, { user, params }) => {
  await markAnnouncementRead(user.userId, idParam(params.id, 'That notice'));
  return ok({ read: true });
});
