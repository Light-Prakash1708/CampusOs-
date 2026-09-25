import { z } from 'zod';
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import * as t from '@/lib/db/schema';
import { AppError, ok, parseBody, withAuth } from '@/lib/api';

/**
 * Marks notices as read for the calling student.
 *
 * Acknowledgement is a different, stronger act and lives on the shared
 * `/api/announcements/[id]/acknowledge` route — reading is not consenting.
 */

const Body = z
  .object({
    announcementId: z.string().uuid().optional(),
    /** Marks every notice addressed to the caller as read. */
    all: z.boolean().optional(),
  })
  .refine((value) => value.announcementId || value.all, {
    message: 'Provide announcementId or all: true.',
  });

export const POST = withAuth(null, async (request, { user }) => {
  const input = await parseBody(request, Body);

  const target = input.all
    ? undefined
    : await db
        .select({ id: t.announcementRecipients.id })
        .from(t.announcementRecipients)
        .where(
          and(
            eq(t.announcementRecipients.institutionId, user.institutionId),
            eq(t.announcementRecipients.userId, user.userId),
            eq(t.announcementRecipients.announcementId, input.announcementId as string),
          ),
        )
        .limit(1);

  if (target && target.length === 0) {
    throw new AppError(
      'That notice was not addressed to you.',
      403,
      'NOT_A_RECIPIENT',
      undefined,
      'Refresh the page — the notice may have been withdrawn.',
    );
  }

  const updated = await db
    .update(t.announcementRecipients)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(t.announcementRecipients.institutionId, user.institutionId),
        eq(t.announcementRecipients.userId, user.userId),
        isNull(t.announcementRecipients.readAt),
        ...(input.all
          ? []
          : [eq(t.announcementRecipients.announcementId, input.announcementId as string)]),
      ),
    )
    .returning({ announcementId: t.announcementRecipients.announcementId });

  // Keep the denormalised read counter in step with the recipient rows.
  if (updated.length > 0) {
    await db
      .update(t.announcements)
      .set({ readCount: sql`${t.announcements.readCount} + 1` })
      .where(
        inArray(
          t.announcements.id,
          updated.map((row) => row.announcementId),
        ),
      );
  }

  return ok({ markedRead: updated.length });
});
