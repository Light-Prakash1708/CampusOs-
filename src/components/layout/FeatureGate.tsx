import { notFound } from 'next/navigation';
import { requireAuth } from '@/lib/auth/context';
import { isEnabled, type FeatureFlag } from '@/lib/features';

/**
 * Segment guard for a flagged module: when the caller's college has the module
 * switched off, every page under the segment is a 404 — the same answer as a
 * route that doesn't exist — so a typed or bookmarked URL can't reach it.
 */
export async function FeatureGate({ flag, children }: { flag: FeatureFlag; children: React.ReactNode }) {
  const user = await requireAuth();
  if (!isEnabled(user.featureFlags, flag)) notFound();
  return <>{children}</>;
}
