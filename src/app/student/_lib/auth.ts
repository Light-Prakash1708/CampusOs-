import 'server-only';
import { redirect } from 'next/navigation';
import { requireAuth, requirePermission, type AuthContext } from '@/lib/auth/context';
import type { Permission } from '@/lib/auth/permissions';

/**
 * Entry guard for every student page.
 *
 * Kept separate from the data helpers so those stay free of routing concerns
 * and can be exercised without a request context.
 */
export interface StudentContext extends AuthContext {
  studentProfileId: string;
}

/**
 * Authenticates, checks the capability, and guarantees a student profile is
 * attached. A STUDENT account without a profile row cannot be served honestly,
 * so it is sent back to its portal root rather than shown empty pages.
 */
export async function requireStudentContext(permission?: Permission): Promise<StudentContext> {
  const user = permission ? await requirePermission(permission) : await requireAuth();
  if (!user.studentProfileId) redirect(`/${user.portal}`);
  return { ...user, studentProfileId: user.studentProfileId };
}
