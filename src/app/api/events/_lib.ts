import { AppError, requireFeatureEnabled } from '@/lib/api';
import type { AuthContext } from '@/lib/auth/context';

export function requireEvents(user: AuthContext) {
  requireFeatureEnabled(user, 'events_enabled');
}

export function parseId(id: string | undefined): string {
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) throw new AppError('Event not found.', 404, 'NOT_FOUND');
  return id;
}
