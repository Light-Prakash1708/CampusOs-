import { z } from 'zod';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { db } from '@/lib/db';
import * as t from '@/lib/db/schema';
import { ok, parseBody, withAuth } from '@/lib/api';

/**
 * Marks the caller's own notifications read — individually, by group, or all.
 * Scoped to `userId` so a notification can never be dismissed on someone
 * else's behalf.
 */

const Body = z
  .object({
    ids: z.array(z.string().uuid()).max(200).optional(),
    groupKey: z.string().max(120).optional(),
    all: z.boolean().optional(),
  })
  .refine((value) => (value.ids && value.ids.length > 0) || value.groupKey || value.all, {
    message: 'Provide ids, groupKey or all: true.',
  });

export const POST = withAuth(null, async (request, { user }) => {
  const input = await parseBody(request, Body);

  const scope = [
    eq(t.notifications.institutionId, user.institutionId),
    eq(t.notifications.userId, user.userId),
    isNull(t.notifications.readAt),
  ];

  if (input.ids && input.ids.length > 0) scope.push(inArray(t.notifications.id, input.ids));
  if (input.groupKey) scope.push(eq(t.notifications.groupKey, input.groupKey));

  const updated = await db
    .update(t.notifications)
    .set({ readAt: new Date() })
    .where(and(...scope))
    .returning({ id: t.notifications.id });

  return ok({ markedRead: updated.length });
});
