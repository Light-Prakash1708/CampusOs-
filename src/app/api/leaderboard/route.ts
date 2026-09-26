import { AppError, ok, withAuth, requireFeatureEnabled } from '@/lib/api';
import { isEnabled } from '@/lib/features';
import { getLeaderboard } from '@/services/gamification';
import { studentOnly } from '../tracker/_lib';

/**
 * Opt-in leaderboard (verified XP only). Scope and period are the only inputs;
 * the college and section always come from the session.
 */
export const GET = withAuth(null, async (request, { user }) => {
  requireFeatureEnabled(user, 'gamification_enabled');
  if (!isEnabled(user.featureFlags, 'leaderboards_enabled')) throw new AppError('Leaderboards are switched off at your college.', 404, 'FEATURE_DISABLED');
  const sp = new URL(request.url).searchParams;
  const scope = sp.get('scope') === 'section' ? 'section' : 'college';
  const period = sp.get('period') === 'all' ? 'all' : sp.get('period') === 'month' ? 'month' : 'week';
  return ok(await getLeaderboard(studentOnly(user), scope, period));
});
