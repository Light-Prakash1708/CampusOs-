import { and, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db';
import * as t from '@/lib/db/schema';
import { AppError, NotFoundError, ok, parseBody, withAuth } from '@/lib/api';
import { getRequestMetadata } from '@/lib/auth/context';
import { recordAudit } from '@/services/audit';
import { assertOfferingBelongsToFaculty } from '../../_lib/attendance';

const Body = z.object({
  action: z.enum(['publish', 'close', 'reopen']),
});

/** Lifecycle transitions for an assignment the caller owns. */
export const PATCH = withAuth('assignment:create', async (request, { user, params }) => {
  const input = await parseBody(request, Body);
  const id = params.id;
  if (!id) throw new NotFoundError('Assignment');

  const [assignment] = await db
    .select()
    .from(t.assignments)
    .where(
      and(
        eq(t.assignments.id, id),
        eq(t.assignments.institutionId, user.institutionId),
        isNull(t.assignments.deletedAt),
      ),
    )
    .limit(1);

  if (!assignment) throw new NotFoundError('Assignment');
  await assertOfferingBelongsToFaculty(user, assignment.offeringId);

  const allowed: Record<string, string[]> = {
    publish: ['DRAFT'],
    close: ['PUBLISHED'],
    reopen: ['CLOSED'],
  };
  if (!allowed[input.action]!.includes(assignment.status)) {
    throw new AppError(
      `An assignment that is ${assignment.status.toLowerCase()} cannot be ${input.action}ed.`,
      409,
      'INVALID_TRANSITION',
      { status: assignment.status },
      'Refresh the page — someone may have changed this assignment already.',
    );
  }

  let seeded = 0;
  await db.transaction(async (tx) => {
    if (input.action === 'publish') {
      await tx
        .update(t.assignments)
        .set({ status: 'PUBLISHED', publishedAt: new Date() })
        .where(eq(t.assignments.id, id));

      // Students who do not yet have a submission row get one, so the
      // "submitted / expected" counts are countable rather than guessed.
      const enrolled = await tx
        .select({ studentId: t.enrollments.studentId })
        .from(t.enrollments)
        .where(
          and(
            eq(t.enrollments.institutionId, user.institutionId),
            eq(t.enrollments.offeringId, assignment.offeringId),
            isNull(t.enrollments.droppedAt),
          ),
        );
      const existing = await tx
        .select({ studentId: t.submissions.studentId })
        .from(t.submissions)
        .where(eq(t.submissions.assignmentId, id));
      const have = new Set(existing.map((e) => e.studentId));
      const missing = enrolled.filter((e) => !have.has(e.studentId));
      if (missing.length > 0) {
        await tx.insert(t.submissions).values(
          missing.map((e) => ({
            institutionId: user.institutionId,
            assignmentId: id,
            studentId: e.studentId,
            status: 'NOT_SUBMITTED' as const,
          })),
        );
      }
      seeded = missing.length;
    } else {
      await tx
        .update(t.assignments)
        .set({ status: input.action === 'close' ? 'CLOSED' : 'PUBLISHED' })
        .where(eq(t.assignments.id, id));
    }
  });

  const meta = await getRequestMetadata();
  await recordAudit(user, {
    action: input.action === 'publish' ? 'ASSIGNMENT_PUBLISHED' : 'ASSIGNMENT_CREATED',
    entityType: 'assignment',
    entityId: id,
    before: { status: assignment.status },
    after: { action: input.action },
    ...meta,
  });

  return ok({ id, action: input.action, studentsAdded: seeded });
});

export const dynamic = 'force-dynamic';
