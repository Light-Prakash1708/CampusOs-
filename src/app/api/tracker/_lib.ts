import { z } from 'zod';
import { ForbiddenError } from '@/lib/api';
import type { AuthContext } from '@/lib/auth/context';
import { GOAL_CATEGORIES } from '@/lib/tracker';

/**
 * Tracker APIs are "my data" APIs: the owner is always the session user, and
 * ids in the URL only select among that user's own rows (services filter by
 * ctx.userId). Only student accounts have a personal tracker.
 */
export function studentOnly(user: AuthContext): AuthContext {
  if (user.portal !== 'student') throw new ForbiddenError('The personal tracker is for students.');
  return user;
}

export { idParam } from '@/lib/api';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-10-01');
export const Title = z.string().trim().min(1, 'Give it a name').max(120);

export const GoalBody = z
  .object({
    title: Title,
    description: z.string().max(1000).nullish(),
    category: z.enum(GOAL_CATEGORIES),
    cadence: z.enum(['DAILY', 'WEEKLY', 'ONCE']),
    targetPerPeriod: z.coerce.number().int().min(1).max(20).default(1),
    unit: z.string().trim().max(24).nullish(),
    targetDate: isoDate.nullish(),
    steps: z.array(z.string().trim().min(1).max(120)).max(30).optional(),
  })
  .refine((g) => g.cadence !== 'WEEKLY' || g.targetPerPeriod <= 7, { message: 'A week has 7 days', path: ['targetPerPeriod'] });

export const GoalPatch = z.object({
  title: Title.optional(),
  description: z.string().max(1000).nullish(),
  category: z.enum(GOAL_CATEGORIES).optional(),
  targetPerPeriod: z.coerce.number().int().min(1).max(20).optional(),
  unit: z.string().trim().max(24).nullish(),
  targetDate: isoDate.nullish(),
  status: z.enum(['ACTIVE', 'PAUSED', 'ARCHIVED']).optional(),
});

export const CheckinBody = z.object({
  amount: z.coerce.number().int().min(0).max(10000).nullish(),
  note: z.string().max(280).nullish(),
  day: z.enum(['today', 'yesterday']).default('today'),
});

export const TaskBody = z.object({ title: Title, dueDate: isoDate.nullish(), goalId: z.string().uuid().nullish() });
export const TaskPatch = z.object({ title: Title.optional(), dueDate: isoDate.nullish(), done: z.boolean().optional() });
