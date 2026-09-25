import { AppError, ok, withAuth } from '@/lib/api';
import { isEnabled } from '@/lib/features';
import { getProgress } from '@/services/gamification';
import { studentOnly } from '../tracker/_lib';

/** My level, XP ledger, badges and this week's challenges. */
export const GET = withAuth(null, async (_request, { user }) => {
  if (!isEnabled(user.featureFlags, 'gamification_enabled')) throw new AppError('Levels and XP are switched off at your college.', 404, 'FEATURE_DISABLED');
  return ok(await getProgress(studentOnly(user)));
});
