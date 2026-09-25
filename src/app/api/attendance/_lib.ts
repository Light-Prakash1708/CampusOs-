import { AppError, ForbiddenError } from '@/lib/api';
import type { AuthContext } from '@/lib/auth/context';

/**
 * The attendance APIs are "my attendance" APIs: the student profile comes from
 * the session, never from the request, so no student can address another's
 * records. Accounts without a student profile (faculty, admins) are refused.
 */
export function studentOf(user: AuthContext) {
  if (!user.studentProfileId) throw new ForbiddenError('Only students have personal attendance.');
  return { ...user, studentProfileId: user.studentProfileId };
}

export function uuidParam(value: string | undefined, what = 'That subject'): string {
  if (!value || !/^[0-9a-f-]{36}$/i.test(value)) throw new AppError(`${what} was not found.`, 404, 'NOT_FOUND');
  return value;
}
