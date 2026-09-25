import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db';
import * as t from '@/lib/db/schema';
import { AppError, NotFoundError, ok, parseBody, withAuth } from '@/lib/api';
import { getRequestMetadata } from '@/lib/auth/context';
import { recordAudit } from '@/services/audit';
import {
  assertOfferingBelongsToFaculty,
  recomputeAttendanceSummaries,
} from '../../_lib/attendance';

/**
 * ATTENDANCE CORRECTION
 * ---------------------------------------------------------------------------
 * Corrections are never destructive. The first correction stores the value the
 * register was submitted with in `original_status`; later corrections leave
 * that untouched, so the original is always recoverable. A reason is
 * mandatory, and every correction writes an audit entry.
 */

const Body = z.object({
  recordId: z.string().uuid(),
  status: z.enum(['PRESENT', 'ABSENT', 'LATE', 'EXCUSED', 'MEDICAL']),
  reason: z.string().trim().min(10, 'Give a reason of at least 10 characters.').max(500),
});

export const POST = withAuth('attendance:correct', async (request, { user }) => {
  const input = await parseBody(request, Body);

  const [row] = await db
    .select({
      record: t.attendanceRecords,
      sessionId: t.attendanceSessions.id,
      sessionDate: t.attendanceSessions.date,
      sessionStatus: t.attendanceSessions.status,
      offeringId: t.attendanceSessions.offeringId,
      studentFirst: t.users.firstName,
      studentLast: t.users.lastName,
      rollNumber: t.studentProfiles.rollNumber,
    })
    .from(t.attendanceRecords)
    .innerJoin(t.attendanceSessions, eq(t.attendanceSessions.id, t.attendanceRecords.sessionId))
    .innerJoin(t.studentProfiles, eq(t.studentProfiles.id, t.attendanceRecords.studentId))
    .innerJoin(t.users, eq(t.users.id, t.studentProfiles.userId))
    .where(
      and(
        eq(t.attendanceRecords.id, input.recordId),
        eq(t.attendanceRecords.institutionId, user.institutionId),
      ),
    )
    .limit(1);

  if (!row) throw new NotFoundError('Attendance record');

  const offering = await assertOfferingBelongsToFaculty(user, row.offeringId);

  if (row.record.status === input.status) {
    throw new AppError(
      `That record is already marked ${input.status.toLowerCase()}.`,
      400,
      'NO_CHANGE',
      undefined,
      'Pick a different value, or close this without saving.',
    );
  }
  if (row.sessionStatus === 'CANCELLED') {
    throw new AppError(
      'This class was cancelled, so its register cannot be corrected.',
      409,
      'SESSION_CANCELLED',
    );
  }

  const previous = row.record.status;

  await db.transaction(async (tx) => {
    await tx
      .update(t.attendanceRecords)
      .set({
        status: input.status,
        // Preserve the value the register was originally submitted with.
        originalStatus: row.record.originalStatus ?? previous,
        correctedById: user.userId,
        correctedAt: new Date(),
        correctionReason: input.reason,
      })
      .where(eq(t.attendanceRecords.id, input.recordId));

    // Denormalised session counts must move with the record.
    await tx.execute(sql`
      UPDATE attendance_sessions s SET
        present_count = c.present,
        absent_count = c.absent,
        total_count = c.total
      FROM (
        SELECT
          COUNT(*) FILTER (WHERE status = 'PRESENT')::int AS present,
          COUNT(*) FILTER (WHERE status = 'ABSENT')::int AS absent,
          COUNT(*)::int AS total
        FROM attendance_records WHERE session_id = ${row.sessionId}
      ) c
      WHERE s.id = ${row.sessionId}
    `);

    await recomputeAttendanceSummaries(tx, {
      institutionId: user.institutionId,
      offeringId: row.offeringId,
      minAttendancePercentage: Number(offering.minAttendancePercentage),
      studentIds: [row.record.studentId],
    });
  });

  const meta = await getRequestMetadata();
  await recordAudit(user, {
    action: 'ATTENDANCE_CORRECTED',
    entityType: 'attendance_record',
    entityId: input.recordId,
    before: { status: previous, originalStatus: row.record.originalStatus },
    after: {
      status: input.status,
      originalStatus: row.record.originalStatus ?? previous,
      sessionDate: row.sessionDate,
      offeringId: row.offeringId,
      student: `${row.rollNumber} ${row.studentFirst} ${row.studentLast}`,
    },
    reason: input.reason,
    ...meta,
  });

  return ok({
    recordId: input.recordId,
    from: previous,
    to: input.status,
    originalStatus: row.record.originalStatus ?? previous,
  });
});

export const dynamic = 'force-dynamic';
