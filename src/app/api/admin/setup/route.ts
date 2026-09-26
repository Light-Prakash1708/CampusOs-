import { ok, withAuth } from '@/lib/api';
import { metaFrom } from '@/lib/http';
import { getSetupProgress, markSetupComplete } from '@/services/institutions';

export const GET = withAuth('institution:view_settings', async (_request, { user }) => ok(await getSetupProgress(user.institutionId)));

/** Marks the college as launched once every setup step is done. */
export const POST = withAuth('institution:manage', async (request, { user }) => {
  await markSetupComplete(user, metaFrom(request));
  return ok({ done: true });
});
