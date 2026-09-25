import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db';
import * as t from '@/lib/db/schema';
import { AppError, ok, parseBody, withAuth } from '@/lib/api';
import { assertOfferingBelongsToFaculty } from '../_lib/attendance';
import { baselineManualMinutes } from '../_lib/estimates';

/**
 * Saving a lesson plan.
 *
 * Two things happen together:
 *   1. the plan is stored as AI_GENERATED_PENDING_REVIEW — it is not approved
 *      material until the author publishes it
 *   2. a time_saved_events row is written with an explicit basis, so the
 *      productivity figure elsewhere in the product traces to real events
 *      rather than a number someone picked
 *
 * The estimate is a per-institution baseline, labelled as an estimate wherever
 * it is displayed. `actualMinutes` is the wall-clock time the author spent in
 * the copilot, measured by the client and clamped here.
 */

const Body = z.object({
  title: z.string().trim().min(3).max(200),
  topic: z.string().trim().min(3).max(160),
  durationMinutes: z.number().int().min(15).max(240),
  subjectId: z.string().uuid(),
  offeringId: z.string().uuid().nullable().optional(),
  content: z.record(z.string(), z.unknown()),
  /** Seconds the author spent in the copilot for this plan. */
  elapsedSeconds: z.number().int().min(0).max(60 * 60 * 8).default(0),
});

export const POST = withAuth('ai:use_copilot', async (request, { user }) => {
  const input = await parseBody(request, Body);

  if (input.offeringId) {
    await assertOfferingBelongsToFaculty(user, input.offeringId);
  }

  const [subject] = await db
    .select({ id: t.subjects.id })
    .from(t.subjects)
    .where(
      and(eq(t.subjects.id, input.subjectId), eq(t.subjects.institutionId, user.institutionId)),
    )
    .limit(1);
  if (!subject) throw new AppError('That subject does not exist.', 400, 'BAD_SUBJECT');

  const estimatedManualMinutes = baselineManualMinutes(input.durationMinutes);
  const actualMinutes = Math.max(1, Math.round(input.elapsedSeconds / 60));
  const savedMinutes = Math.max(0, estimatedManualMinutes - actualMinutes);

  const created = await db.transaction(async (tx) => {
    const [plan] = await tx
      .insert(t.lessonPlans)
      .values({
        institutionId: user.institutionId,
        offeringId: input.offeringId ?? null,
        subjectId: input.subjectId,
        authorId: user.userId,
        title: input.title,
        topic: input.topic,
        durationMinutes: input.durationMinutes,
        content: input.content,
        status: 'AI_GENERATED_PENDING_REVIEW',
        isAiGenerated: true,
        estimatedManualMinutes,
        actualMinutesSpent: actualMinutes,
      })
      .returning({ id: t.lessonPlans.id });

    if (!plan) throw new AppError('The lesson plan could not be saved.', 500);

    await tx.insert(t.timeSavedEvents).values({
      institutionId: user.institutionId,
      userId: user.userId,
      activity: 'LESSON_PLAN',
      estimatedManualMinutes,
      actualMinutes,
      savedMinutes,
      basis: 'DEFAULT_ESTIMATE',
      entityType: 'lesson_plan',
      entityId: plan.id,
    });

    return plan;
  });

  return ok({
    id: created.id,
    status: 'AI_GENERATED_PENDING_REVIEW',
    estimatedManualMinutes,
    actualMinutes,
    savedMinutes,
  });
});

export const dynamic = 'force-dynamic';
