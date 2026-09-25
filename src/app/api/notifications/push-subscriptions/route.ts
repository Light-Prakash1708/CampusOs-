import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import * as t from '@/lib/db/schema';
import { ok, parseBody, withAuth } from '@/lib/api';
import { userAgent } from '@/lib/http';

const Body = z.object({ kind: z.enum(['fcm', 'webpush']), token: z.string().min(10).max(4096) });

/** Registers this device for push. Re-registering a token moves it to the caller. */
export const POST = withAuth(null, async (request, { user }) => {
  const input = await parseBody(request, Body);
  await db
    .insert(t.pushSubscriptions)
    .values({ institutionId: user.institutionId, userId: user.userId, kind: input.kind, token: input.token, userAgent: userAgent(request.headers) })
    .onConflictDoUpdate({
      target: [t.pushSubscriptions.kind, t.pushSubscriptions.token],
      set: { userId: user.userId, institutionId: user.institutionId, revokedAt: null, lastSeenAt: new Date() },
    });
  return ok({ registered: true }, { status: 201 });
});

export const DELETE = withAuth(null, async (request, { user }) => {
  const input = await parseBody(request, Body);
  await db
    .update(t.pushSubscriptions)
    .set({ revokedAt: new Date() })
    .where(and(eq(t.pushSubscriptions.userId, user.userId), eq(t.pushSubscriptions.kind, input.kind), eq(t.pushSubscriptions.token, input.token)));
  return ok({ unregistered: true });
});
