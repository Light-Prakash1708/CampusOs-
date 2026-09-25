import { and, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db';
import * as t from '@/lib/db/schema';
import { AppError, ConflictError, ok, parseBody, withAuth } from '@/lib/api';
import { getRequestMetadata } from '@/lib/auth/context';
import { recordAudit } from '@/services/audit';
import {
  assertOfferingBelongsToFaculty,
  recomputeAttendanceSummaries,
} from '../_lib/attendance';

/**
 * ATTENDANCE SUBMISSION
 * ---------------------------------------------------------------------------
 * One transaction writes: the session (created or updated), every student
 * record, the denormalised session counts, and the per-student rollups. If any
 * part fails nothing is written — a half-marked register is worse than none.
 *
 * Re-submitting an already submitted register is refused rather than silently
 * overwritten: changing a recorded value is a *correction*, which requires a
 * reason and produces an audit entry. See ./correct/route.ts.
 */

const ATTENDANCE_STATUSES = ['PRESENT', 'ABSENT', 'LATE', 'EXCUSED', 'MEDICAL'] as const;

const Body = z.object({
  offeringId: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD.'),
  timetableEntryId: z.string().uuid().nullable().optional(),
  topicCovered: z.string().max(280).optional(),
  records: z
    .array(
      z.object({
        studentId: z.string().uuid(),
        status: z.enum(ATTENDANCE_STATUSES),
        note: z.string().max(280).optional(),
      }),
    )
    .min(1, 'Mark at least one student.')
    .max(500),
});

export const POST = withAuth('attendance:mark', async (request, { user }) => {
  const input = await parseBody(request, Body);

  if (!user.facultyProfileId) {
    throw new AppError(
      'Your account has no faculty record, so attendance cannot be attributed to you.',
      403,
      'NO_FACULTY_PROFILE',
      undefined,
      'Ask your administrator to link a faculty profile to your login.',
    );
  }

  const offering = await assertOfferingBelongsToFaculty(user, input.offeringId);

  // The date must sit inside the term the class is taught in.
  const [term] = await db
    .select({ start: t.terms.startDate, end: t.terms.endDate, name: t.terms.name })
    .from(t.terms)
    .where(eq(t.terms.id, offering.termId))
    .limit(1);
  if (term && (input.date < term.start || input.date > term.end)) {
    throw new AppError(
      `${input.date} falls outside ${term.name} (${term.start} to ${term.end}).`,
      400,
      'DATE_OUT_OF_TERM',
      undefined,
      'Pick a date inside the teaching term.',
    );
  }

  // Only enrolled, non-dropped students may be marked.
  const enrolled = await db
    .select({ studentId: t.enrollments.studentId })
    .from(t.enrollments)
    .where(
      and(
        eq(t.enrollments.institutionId, user.institutionId),
        eq(t.enrollments.offeringId, input.offeringId),
        isNull(t.enrollments.droppedAt),
      ),
    );
  const enrolledIds = new Set(enrolled.map((e) => e.studentId));

  const unknown = input.records.filter((r) => !enrolledIds.has(r.studentId));
  if (unknown.length > 0) {
    throw new AppError(
      `${unknown.length} of the students submitted are not enrolled in this class.`,
      400,
      'NOT_ENROLLED',
      { studentIds: unknown.map((u) => u.studentId) },
      'Reload the roster — the enrolment list has changed since this page loaded.',
    );
  }

  const seen = new Set<string>();
  for (const r of input.records) {
    if (seen.has(r.studentId)) {
      throw new AppError(
        'The same student appears twice in this register.',
        400,
        'DUPLICATE_STUDENT',
      );
    }
    seen.add(r.studentId);
  }

  // The room comes from the scheduled period, when the register is tied to one.
  let roomId: string | null = null;
  if (input.timetableEntryId) {
    const [entry] = await db
      .select({ roomId: t.timetableEntries.roomId, offeringId: t.timetableEntries.offeringId })
      .from(t.timetableEntries)
      .where(
        and(
          eq(t.timetableEntries.id, input.timetableEntryId),
          eq(t.timetableEntries.institutionId, user.institutionId),
        ),
      )
      .limit(1);
    if (!entry || entry.offeringId !== input.offeringId) {
      throw new AppError(
        'That scheduled period does not belong to this class.',
        400,
        'ENTRY_MISMATCH',
        undefined,
        'Reload the attendance page and pick the class again.',
      );
    }
    roomId = entry.roomId;
  }

  const presentCount = input.records.filter((r) => r.status === 'PRESENT').length;
  const lateCount = input.records.filter((r) => r.status === 'LATE').length;
  const absentCount = input.records.filter((r) => r.status === 'ABSENT').length;
  const entryId = input.timetableEntryId ?? null;

  const result = await db.transaction(async (tx) => {
    // Lock/lookup an existing register for this class on this date.
    const existing = await tx
      .select({ id: t.attendanceSessions.id, status: t.attendanceSessions.status })
      .from(t.attendanceSessions)
      .where(
        and(
          eq(t.attendanceSessions.institutionId, user.institutionId),
          eq(t.attendanceSessions.offeringId, input.offeringId),
          eq(t.attendanceSessions.date, input.date),
          entryId
            ? eq(t.attendanceSessions.timetableEntryId, entryId)
            : isNull(t.attendanceSessions.timetableEntryId),
        ),
      )
      .limit(1);

    const prior = existing[0];
    if (prior && (prior.status === 'SUBMITTED' || prior.status === 'LOCKED')) {
      throw new ConflictError(
        'Attendance for this class on this date has already been submitted.',
        { sessionId: prior.id, status: prior.status },
        'To change a recorded value, use "Correct a record" — corrections keep the original value and require a reason.',
      );
    }
    if (prior && prior.status === 'CANCELLED') {
      throw new ConflictError(
        'This class was cancelled on this date, so a register cannot be submitted for it.',
        { sessionId: prior.id },
        'If the class did in fact run, ask the academic office to remove the cancellation first.',
      );
    }

    let sessionId: string;
    if (prior) {
      await tx
        .update(t.attendanceSessions)
        .set({
          status: 'SUBMITTED',
          takenById: user.facultyProfileId,
          topicCovered: input.topicCovered ?? null,
          presentCount,
          absentCount,
          totalCount: input.records.length,
          submittedAt: new Date(),
          roomId,
        })
        .where(eq(t.attendanceSessions.id, prior.id));
      sessionId = prior.id;
    } else {
      const [created] = await tx
        .insert(t.attendanceSessions)
        .values({
          institutionId: user.institutionId,
          offeringId: input.offeringId,
          timetableEntryId: entryId,
          date: input.date,
          roomId,
          takenById: user.facultyProfileId,
          status: 'SUBMITTED',
          topicCovered: input.topicCovered ?? null,
          presentCount,
          absentCount,
          totalCount: input.records.length,
          submittedAt: new Date(),
        })
        .returning({ id: t.attendanceSessions.id });
      if (!created) throw new AppError('The attendance session could not be created.', 500);
      sessionId = created.id;
    }

    // Records for a re-opened session are replaced wholesale; the session was
    // never in a submitted state, so nothing auditable is being overwritten.
    await tx.delete(t.attendanceRecords).where(eq(t.attendanceRecords.sessionId, sessionId));
    await tx.insert(t.attendanceRecords).values(
      input.records.map((r) => ({
        institutionId: user.institutionId,
        sessionId,
        studentId: r.studentId,
        status: r.status,
        markedById: user.userId,
        markedAt: new Date(),
        note: r.note ?? null,
      })),
    );

    await recomputeAttendanceSummaries(tx, {
      institutionId: user.institutionId,
      offeringId: input.offeringId,
      minAttendancePercentage: Number(offering.minAttendancePercentage),
      studentIds: input.records.map((r) => r.studentId),
    });

    return { sessionId };
  });

  const meta = await getRequestMetadata();
  await recordAudit(user, {
    action: 'ATTENDANCE_SUBMITTED',
    entityType: 'attendance_session',
    entityId: result.sessionId,
    after: {
      offeringId: input.offeringId,
      date: input.date,
      present: presentCount,
      late: lateCount,
      absent: absentCount,
      total: input.records.length,
    },
    ...meta,
  });

  return ok({
    sessionId: result.sessionId,
    date: input.date,
    present: presentCount,
    late: lateCount,
    absent: absentCount,
    total: input.records.length,
  });
});

/** Roster + any existing register for a class on a date. */
export const GET = withAuth('attendance:mark', async (request, { user }) => {
  const url = new URL(request.url);
  const offeringId = url.searchParams.get('offering');
  const date = url.searchParams.get('date');

  if (!offeringId || !date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new AppError(
      'A class and a date (YYYY-MM-DD) are required.',
      400,
      'MISSING_PARAMETERS',
    );
  }

  await assertOfferingBelongsToFaculty(user, offeringId);

  const [session] = await db
    .select({
      id: t.attendanceSessions.id,
      status: t.attendanceSessions.status,
      presentCount: t.attendanceSessions.presentCount,
      totalCount: t.attendanceSessions.totalCount,
    })
    .from(t.attendanceSessions)
    .where(
      and(
        eq(t.attendanceSessions.institutionId, user.institutionId),
        eq(t.attendanceSessions.offeringId, offeringId),
        eq(t.attendanceSessions.date, date),
      ),
    )
    .limit(1);

  if (!session) return ok({ session: null, records: [] });

  const records = await db
    .select({
      studentId: t.attendanceRecords.studentId,
      status: t.attendanceRecords.status,
    })
    .from(t.attendanceRecords)
    .where(eq(t.attendanceRecords.sessionId, session.id));

  return ok({ session, records });
});

export const dynamic = 'force-dynamic';
