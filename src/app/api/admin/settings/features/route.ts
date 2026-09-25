import { z } from 'zod';
import { ok, parseBody, withAuth } from '@/lib/api';
import { metaFrom } from '@/lib/http';
import { FEATURE_FLAGS, type FeatureFlag } from '@/lib/features';
import { updateFeatureFlags } from '@/services/institution-settings';

const flagKeys = Object.keys(FEATURE_FLAGS) as [FeatureFlag, ...FeatureFlag[]];
const Body = z.object({ flags: z.partialRecord(z.enum(flagKeys), z.boolean()) });

export const PATCH = withAuth('institution:manage', async (request, { user }) => {
  const { flags } = await parseBody(request, Body);
  return ok({ flags: await updateFeatureFlags(user, flags, metaFrom(request)) });
});
