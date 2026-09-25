import { ok, withAuth } from '@/lib/api';
import { isEnabled, type FeatureFlag } from '@/lib/features';
import { DATA_CATEGORIES } from '@/services/privacy/catalogue';

/** What CampusOS stores, why, and who can see it — only for modules this college uses. */
export const GET = withAuth('privacy:manage_own', async (_request, { user }) =>
  ok(DATA_CATEGORIES.filter((c) => !c.feature || isEnabled(user.featureFlags, c.feature as FeatureFlag))),
);
