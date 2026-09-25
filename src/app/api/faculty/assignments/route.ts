import { and, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db';
import * as t from '@/lib/db/schema';
import { AppError, ok, parseBody, withAuth } from '@/lib/api';
import { getRequestMetadata } from '@/lib/auth/context';
import { recordAudit } from '@/services/audit';
import { assertOfferingBelongsToFaculty } from '../_lib/attendance';

/**
 * Creating an assignment.
 *
 * Publishing materialises one NOT_SUBMITTED row per enrolled student, so the
 * "12 of 48 in" figures on every screen are counted from real rows rather than
 * inferred. A draft creates nothing beyond the assignment itself.
 */

const RubricRow = z.object({
  criterion: z.string().trim().min(1).max(160),
  maxScore: z.number().min(0).max(1000),
  descriptor: z.string().trim().max(300).optional(),
});

const Body = z.object({
  offeringId: z.string().uuid(),
  title: z.string().trim().min(3, 'Give the assignment a title.').max(200),
  instructions: z.string().trim().max(8000).optional(),
  maxScore: z.number().positive().max(1000),
  dueAt: z.string().datetime({ offset: true }).nullable().optional(),
  allowLateSubmission: z.boolean().default(true),
  rubric: z.array(RubricRow).max(20).default([]),
  skillTags: z.array(z.string().trim().min(1).max(60)).max(15).default([]),
  publish: z.boolean().default(false),
});

export const POST = withAuth('assignment:create', async (request, { user }) => {
  const input = await parseBody(request, Body);
  const offering = await assertOfferingBelongsToFaculty(user, input.offeringId);

  const rubricTotal = input.rubric.reduce((sum, r) => sum + r.maxScore, 0);
  if (input.rubric.length > 0 && Math.abs(rubricTotal - input.maxScore) > 0.001) {
    throw new AppError(
      `The rubric rows add up to ${rubricTotal}, but the assignment is out of ${input.maxScore}.`,
      400,
      'RUBRIC_MISMATCH',
      { rubricTotal, maxScore: input.maxScore },
      'Adjust a rubric row or the maximum score so the two agree.',
    );
  }

  const dueAt = input.dueAt ? new Date(input.dueAt) : null;
  if (dueAt && Number.isNaN(dueAt.getTime())) {
    throw new AppError('The due date could not be read.', 400, 'INVALID_DATE');
  }

  const created = await db.transaction(async (tx) => {
    const [assignment] = await tx
      .insert(t.assignments)
      .values({
        institutionId: user.institutionId,
        offeringId: input.offeringId,
        createdById: user.facultyProfileId,
        title: input.title,
        instructions: input.instructions ?? null,
        maxScore: input.maxScore.toFixed(2),
        rubric: input.rubric,
        skillTags: input.skillTags,
        dueAt,
        allowLateSubmission: input.allowLateSubmission,
        status: input.publish ? 'PUBLISHED' : 'DRAFT',
        publishedAt: input.publish ? new Date() : null,
      })
      .returning({ id: t.assignments.id });

    if (!assignment) throw new AppError('The assignment could not be created.', 500);

    let seeded = 0;
    if (input.publish) {
      const enrolled = await tx
        .select({ studentId: t.enrollments.studentId })
        .from(t.enrollments)
        .where(
          and(
            eq(t.enrollments.institutionId, user.institutionId),
            eq(t.enrollments.offeringId, input.offeringId),
            isNull(t.enrollments.droppedAt),
          ),
        );

      if (enrolled.length > 0) {
        await tx.insert(t.submissions).values(
          enrolled.map((e) => ({
            institutionId: user.institutionId,
            assignmentId: assignment.id,
            studentId: e.studentId,
            status: 'NOT_SUBMITTED' as const,
          })),
        );
      }
      seeded = enrolled.length;
    }

    return { id: assignment.id, seeded };
  });

  const meta = await getRequestMetadata();
  await recordAudit(user, {
    action: input.publish ? 'ASSIGNMENT_PUBLISHED' : 'ASSIGNMENT_CREATED',
    entityType: 'assignment',
    entityId: created.id,
    after: {
      title: input.title,
      offering: `${offering.subjectCode} ${offering.sectionCode}`,
      maxScore: input.maxScore,
      dueAt: dueAt?.toISOString() ?? null,
      published: input.publish,
    },
    ...meta,
  });

  return ok({
    id: created.id,
    status: input.publish ? 'PUBLISHED' : 'DRAFT',
    studentsNotified: created.seeded,
  });
});

export const dynamic = 'force-dynamic';
