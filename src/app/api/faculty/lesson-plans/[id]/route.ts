import { and, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db';
import * as t from '@/lib/db/schema';
import { AppError, NotFoundError, ok, parseBody, withAuth, requireFeatureEnabled, idParam } from '@/lib/api';

/**
 * Editing and publishing a saved lesson plan.
 *
 * Publishing is the human approval step: it flips the record to PUBLISHED,
 * which is what lets the UI change the label from "AI generated · needs
 * review" to "Reviewed and approved". Nothing else may set that state.
 */

const Body = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('publish'),
  }),
  z.object({
    action: z.literal('update'),
    title: z.string().trim().min(3).max(200).optional(),
    content: z.record(z.string(), z.unknown()),
  }),
]);

export const PATCH = withAuth('ai:use_copilot', async (request, { user, params }) => {
  requireFeatureEnabled(user, 'teacher_copilot_enabled');
  const input = await parseBody(request, Body);
  const id = idParam(params.id, 'That lesson plan');
  if (!id) throw new NotFoundError('Lesson plan');

  const [plan] = await db
    .select()
    .from(t.lessonPlans)
    .where(
      and(
        eq(t.lessonPlans.id, id),
        eq(t.lessonPlans.institutionId, user.institutionId),
        // A plan belongs to its author; nobody edits someone else's draft.
        eq(t.lessonPlans.authorId, user.userId),
        isNull(t.lessonPlans.deletedAt),
      ),
    )
    .limit(1);

  if (!plan) throw new NotFoundError('Lesson plan');

  if (input.action === 'publish') {
    if (plan.status === 'PUBLISHED') {
      throw new AppError('This plan is already published.', 409, 'ALREADY_PUBLISHED');
    }
    await db
      .update(t.lessonPlans)
      .set({ status: 'PUBLISHED', publishedAt: new Date() })
      .where(eq(t.lessonPlans.id, id));
    return ok({ id, status: 'PUBLISHED' });
  }

  await db
    .update(t.lessonPlans)
    .set({
      content: input.content,
      ...(input.title ? { title: input.title } : {}),
      // Editing a published plan returns it to review, because the approved
      // version is no longer what is on screen.
      ...(plan.status === 'PUBLISHED'
        ? { status: 'AI_GENERATED_PENDING_REVIEW' as const, publishedAt: null }
        : {}),
    })
    .where(eq(t.lessonPlans.id, id));

  return ok({
    id,
    status: plan.status === 'PUBLISHED' ? 'AI_GENERATED_PENDING_REVIEW' : plan.status,
  });
});

export const dynamic = 'force-dynamic';
