import { z } from 'zod';
import { db } from '@/lib/db';
import * as t from '@/lib/db/schema';
import { AppError, ok, parseBody, withAuth } from '@/lib/api';
import { getRequestMetadata } from '@/lib/auth/context';
import { recordAudit } from '@/services/audit';
import { computeLeaveImpact, nextLeaveReference } from '../_lib/leave';

/**
 * Submitting leave.
 *
 * The impact is recomputed here rather than trusted from the client, and the
 * request plus its approval task are written in one transaction: a leave
 * request that nobody is asked to approve is a silent failure.
 */

const Body = z.object({
  leaveType: z.enum(['CASUAL', 'MEDICAL', 'EARNED', 'DUTY', 'OTHER']),
  fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  toDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  isHalfDay: z.boolean().default(false),
  reason: z.string().trim().min(10, 'Give a reason of at least 10 characters.').max(1000),
});

export const POST = withAuth('leave:request', async (request, { user }) => {
  const input = await parseBody(request, Body);

  if (input.isHalfDay && input.fromDate !== input.toDate) {
    throw new AppError(
      'A half day must start and end on the same date.',
      400,
      'INVALID_HALF_DAY',
    );
  }

  const impact = await computeLeaveImpact(user, input.fromDate, input.toDate);
  const needingCover = impact.classes.filter((c) => !c.alreadyCovered);

  const reference = await nextLeaveReference(user.institutionId);

  const created = await db.transaction(async (tx) => {
    const [leave] = await tx
      .insert(t.leaveRequests)
      .values({
        institutionId: user.institutionId,
        requesterId: user.userId,
        reference,
        leaveType: input.leaveType,
        fromDate: input.fromDate,
        toDate: input.toDate,
        isHalfDay: input.isHalfDay,
        reason: input.reason,
        status: 'PENDING',
        affectedOfferingIds: impact.offeringIds,
        affectedClassCount: needingCover.length,
        substitutePlan: [],
      })
      .returning({ id: t.leaveRequests.id });

    if (!leave) throw new AppError('The leave request could not be created.', 500);

    await tx.insert(t.approvals).values({
      institutionId: user.institutionId,
      kind: 'LEAVE_REQUEST',
      status: 'PENDING',
      title: `Leave request — ${user.fullName} (${input.fromDate}${
        input.fromDate === input.toDate ? '' : ` to ${input.toDate}`
      })`,
      description: input.reason,
      payload: {
        leaveRequestId: leave.id,
        reference,
        leaveType: input.leaveType,
        fromDate: input.fromDate,
        toDate: input.toDate,
        isHalfDay: input.isHalfDay,
      },
      impactSummary: {
        classesNeedingCover: needingCover.length,
        studentsAffected: impact.studentsAffected,
        offeringIds: impact.offeringIds,
        classes: needingCover.map((c) => ({
          date: c.date,
          period: c.slotLabel,
          subject: c.subjectCode,
          section: c.sectionCode,
          room: c.roomCode,
        })),
      },
      entityType: 'leave_request',
      entityId: leave.id,
      requestedById: user.userId,
      requiredRole: 'HOD',
    });

    return leave;
  });

  const meta = await getRequestMetadata();
  await recordAudit(user, {
    action: 'LEAVE_REQUESTED',
    entityType: 'leave_request',
    entityId: created.id,
    after: {
      reference,
      leaveType: input.leaveType,
      fromDate: input.fromDate,
      toDate: input.toDate,
      classesNeedingCover: needingCover.length,
      studentsAffected: impact.studentsAffected,
    },
    reason: input.reason,
    ...meta,
  });

  return ok({
    id: created.id,
    reference,
    status: 'PENDING',
    classesNeedingCover: needingCover.length,
    studentsAffected: impact.studentsAffected,
  });
});

export const dynamic = 'force-dynamic';
