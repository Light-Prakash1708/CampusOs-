import { idParam, ok, withAuth } from '@/lib/api';
import { metaFrom } from '@/lib/http';
import { resetMfaFor } from '@/services/auth/mfa';

/** An administrator resets someone's two-step sign-in (audited; their sessions end). */
export const POST = withAuth('institution:manage', async (request, { user, params }) => {
  await resetMfaFor(user, idParam(params.id, 'That person'), metaFrom(request));
  return ok({ reset: true });
});
