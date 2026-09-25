import { z } from 'zod';
import { ok, parseBody, withAuth } from '@/lib/api';
import { metaFrom } from '@/lib/http';
import { AI_COACH_SCOPES } from '@/services/privacy/catalogue';
import { getPrivacyPreferences, updatePrivacyPreferences } from '@/services/privacy';

const Patch = z
  .object({
    leaderboardVisibility: z.enum(['PUBLIC', 'ANONYMOUS', 'PRIVATE', 'OPT_OUT']),
    profileVisibility: z.enum(['INSTITUTION', 'PRIVATE']),
    showStreaks: z.boolean(),
    showAchievements: z.boolean(),
    showEventParticipation: z.boolean(),
    personalizedRecommendations: z.boolean(),
    aiMemoryEnabled: z.boolean(),
    aiCoachScopes: z.array(z.enum(AI_COACH_SCOPES)).max(AI_COACH_SCOPES.length),
    source: z.enum(['privacy_center', 'onboarding']).optional(),
  })
  .partial()
  .strict();

export const GET = withAuth('privacy:manage_own', async (_request, { user }) => ok(await getPrivacyPreferences(user)));

export const PATCH = withAuth('privacy:manage_own', async (request, { user }) => {
  const { source, ...patch } = await parseBody(request, Patch);
  return ok(await updatePrivacyPreferences(user, patch, { ...metaFrom(request), source }));
});
