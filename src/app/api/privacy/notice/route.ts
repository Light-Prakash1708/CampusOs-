import { ok, withAuth } from '@/lib/api';
import { getRequestMetadata } from '@/lib/auth/context';
import { acceptPrivacyNotice } from '@/services/privacy';

/** Records that the signed-in user accepted the current privacy notice. */
export const POST = withAuth(null, async (_request, { user }) => ok(await acceptPrivacyNotice(user, await getRequestMetadata())));
