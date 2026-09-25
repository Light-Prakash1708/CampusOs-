import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db';
import * as t from '@/lib/db/schema';
import { ok, parseBody, withAuth } from '@/lib/api';

/** Marks notifications read. Scoped to the caller's own rows, always. */
const Body = z.union([
  z.object({ scope: z.literal('all') }),
  z.object({ scope: z.literal('some'), ids: z.array(z.string().uuid()).min(1).max(200) }),
]);

export const POST = withAuth(null, async (request, { user }) => {
  const input = await parseBody(request, Body);

  const result = await db
    .update(t.notifications)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(t.notifications.userId, user.userId),
        eq(t.notifications.institutionId, user.institutionId),
        isNull(t.notifications.readAt),
        input.scope === 'some' ? inArray(t.notifications.id, input.ids) : sql`true`,
      ),
    )
    .returning({ id: t.notifications.id });

  return ok({ markedRead: result.length });
});

export const dynamic = 'force-dynamic';
