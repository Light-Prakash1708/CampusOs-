import { enforceRateLimit, keyFor, RATE_LIMITS } from '@/services/rate-limit';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db';
import * as t from '@/lib/db/schema';
import { AppError, ok, parseBody, withAuth } from '@/lib/api';
import { generateLessonPlan } from '@/services/ai/assistant';
import { assertOfferingBelongsToFaculty } from '../_lib/attendance';

/**
 * TEACHER COPILOT — generation only.
 *
 * This endpoint never writes a lesson plan. It returns a draft the faculty
 * member can edit, regenerate or discard; saving is a separate, explicit
 * action (POST /api/faculty/lesson-plans). That separation is what makes the
 * "AI generated · needs review" label on the draft true.
 */

const Body = z.object({
  subjectId: z.string().uuid(),
  offeringId: z.string().uuid().nullable().optional(),
  topic: z.string().trim().min(3, 'Give the topic you are teaching.').max(160),
  durationMinutes: z.number().int().min(15).max(240),
});

export const POST = withAuth('ai:use_copilot', async (request, { user }) => {
  const input = await parseBody(request, Body);
  await enforceRateLimit(
    keyFor('ai', user.userId),
    { limit: Number(process.env.AI_USER_HOURLY_LIMIT ?? RATE_LIMITS.aiPerUserHour.limit), windowSec: RATE_LIMITS.aiPerUserHour.windowSec },
    'You have reached the hourly limit for AI features.',
  );

  if (input.offeringId) {
    const offering = await assertOfferingBelongsToFaculty(user, input.offeringId);
    if (offering.subjectId !== input.subjectId) {
      throw new AppError(
        'That subject does not match the class you selected.',
        400,
        'SUBJECT_MISMATCH',
      );
    }
  } else {
    const [subject] = await db
      .select({ id: t.subjects.id })
      .from(t.subjects)
      .where(
        and(
          eq(t.subjects.id, input.subjectId),
          eq(t.subjects.institutionId, user.institutionId),
        ),
      )
      .limit(1);
    if (!subject) {
      throw new AppError('That subject does not exist at your institution.', 400, 'BAD_SUBJECT');
    }
  }

  const startedAt = Date.now();
  let result: Awaited<ReturnType<typeof generateLessonPlan>>;
  try {
    result = await generateLessonPlan(user, {
      subjectId: input.subjectId,
      topic: input.topic,
      durationMinutes: input.durationMinutes,
      offeringId: input.offeringId ?? undefined,
    });
  } catch (error) {
    // Surface the real cause rather than a generic failure.
    throw new AppError(
      error instanceof Error
        ? `The lesson planner could not produce a plan: ${error.message}`
        : 'The lesson planner could not produce a plan.',
      502,
      'AI_GENERATION_FAILED',
      undefined,
      'Try again, or write the plan yourself — nothing was saved.',
    );
  }

  return ok({
    content: result.content,
    provider: result.provider,
    isLanguageModel: result.isLanguageModel,
    generationMs: Date.now() - startedAt,
    topic: input.topic,
    durationMinutes: input.durationMinutes,
  });
});

export const dynamic = 'force-dynamic';
