import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { publishAnnouncement } from '@/services/communication';
import * as t from '@/lib/db/schema';
import { withAuth, ok, parseBody, AppError, NotFoundError } from '@/lib/api';
import { recordAudit } from '@/services/audit';

const Body = z.object({
  approvalId: z.string().uuid(),
  decision: z.enum(['APPROVED', 'REJECTED']),
  note: z.string().trim().max(1000).optional(),
});

/**
 * Decides a pending approval.
 *
 * On APPROVED the stored payload is executed by the handler registered for the
 * approval kind. Execution is re-validated at this point — an approval granted
 * yesterday cannot apply a change that has since become invalid.
 */
export const POST = withAuth(
  ['timetable:approve_change', 'announcement:approve', 'leave:approve'],
  async (request, { user }) => {
    const { approvalId, decision, note } = await parseBody(request, Body);

    const [approval] = await db
      .select()
      .from(t.approvals)
      .where(
        and(eq(t.approvals.id, approvalId), eq(t.approvals.institutionId, user.institutionId)),
      )
      .limit(1);

    if (!approval) throw new NotFoundError('Approval');
    if (approval.status !== 'PENDING') {
      throw new AppError(
        `This request was already ${approval.status.toLowerCase()}.`,
        409,
        'ALREADY_DECIDED',
      );
    }

    let executionError: string | null = null;

    if (decision === 'APPROVED') {
      try {
        await executeApproval(approval, user.institutionId);
      } catch (error) {
        executionError = error instanceof Error ? error.message : String(error);
      }
    }

    await db
      .update(t.approvals)
      .set({
        status: executionError ? 'PENDING' : decision,
        decidedById: user.userId,
        decidedAt: new Date(),
        decisionNote: note ?? null,
        executedAt: decision === 'APPROVED' && !executionError ? new Date() : null,
        executionError,
      })
      .where(eq(t.approvals.id, approvalId));

    await recordAudit(user, {
      action: 'APPROVAL_DECIDED',
      entityType: 'approval',
      entityId: approvalId,
      before: { status: 'PENDING' },
      after: { status: executionError ? 'PENDING' : decision, executionError },
      reason: note,
    });

    if (executionError) {
      throw new AppError(
        'The request was approved but could not be applied.',
        409,
        'EXECUTION_FAILED',
        { executionError },
        'The underlying records may have changed. Review and retry.',
      );
    }

    // Tell the requester what happened.
    if (approval.requestedById) {
      await db.insert(t.notifications).values({
        institutionId: user.institutionId,
        userId: approval.requestedById,
        title: `Your request was ${decision.toLowerCase()}`,
        body: `${approval.title}${note ? ` — ${note}` : ''}`,
        priority: 'IMPORTANT',
        category: 'ADMINISTRATIVE',
        groupKey: 'approvals',
        sourceType: 'approval',
        sourceId: approvalId,
      });
    }

    return ok({ status: decision });
  },
);

/**
 * Applies the effect of an approved request.
 * Unknown kinds fail loudly rather than silently marking the approval done.
 */
async function executeApproval(
  approval: typeof t.approvals.$inferSelect,
  institutionId: string,
): Promise<void> {
  switch (approval.kind) {
    case 'LEAVE_REQUEST': {
      const reference = (approval.payload as { reference?: string }).reference;
      if (!reference) throw new Error('Leave request reference missing from approval payload.');

      const result = await db
        .update(t.leaveRequests)
        .set({ status: 'APPROVED', reviewedAt: new Date() })
        .where(
          and(
            eq(t.leaveRequests.institutionId, institutionId),
            eq(t.leaveRequests.reference, reference),
            eq(t.leaveRequests.status, 'PENDING'),
          ),
        )
        .returning({ id: t.leaveRequests.id });

      if (result.length === 0) {
        throw new Error('The leave request is no longer pending.');
      }
      return;
    }

    case 'ANNOUNCEMENT_PUBLISH': {
      const announcementId = (approval.payload as { announcementId?: string }).announcementId;
      if (!announcementId) throw new Error('Announcement id missing from approval payload.');
      // Resolves the audience and delivers the notice; scoped to the approver's college.
      await publishAnnouncement(announcementId, institutionId);
      return;
    }

    default:
      throw new Error(
        `No execution handler is implemented for approval kind ${approval.kind}. Approve it manually in the relevant module.`,
      );
  }
}
