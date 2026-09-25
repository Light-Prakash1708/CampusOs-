import { withAuth, ok } from '@/lib/api';
import { acknowledgeAnnouncement, markAnnouncementRead } from '@/services/communication';

/**
 * Records an explicit acknowledgement of a notice.
 * Any authenticated recipient may acknowledge; the service verifies that the
 * caller was actually addressed, so this cannot be used to inflate counts.
 */
export const POST = withAuth(null, async (_request, { user, params }) => {
  const result = await acknowledgeAnnouncement(user.userId, params.id!);
  return ok(result);
});
