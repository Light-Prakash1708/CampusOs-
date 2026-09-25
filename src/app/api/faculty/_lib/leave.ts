import 'server-only';
import { and, eq, gte, inArray, lte, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import * as t from '@/lib/db/schema';
import type { AuthContext } from '@/lib/auth/context';
import { AppError } from '@/lib/api';
import {
  dayNameOf,
  eachDateInclusive,
  fromISODate,
  getCurrentTerm,
  getMySchedule,
  getPublishedVersionId,
} from '@/app/faculty/_lib/faculty';

export interface AffectedClass {
  date: string;
  dayOfWeek: string;
  entryId: string;
  offeringId: string;
  slotLabel: string;
  startTime: string;
  endTime: string;
  subjectCode: string;
  subjectName: string;
  sectionCode: string;
  roomCode: string | null;
  studentCount: number;
  /** True when the period is already cancelled or a holiday falls on the date. */
  alreadyCovered: boolean;
  coveredReason: string | null;
}

export interface LeaveImpact {
  classes: AffectedClass[];
  offeringIds: string[];
  studentsAffected: number;
  workingDays: number;
  holidays: { date: string; name: string }[];
  /** Present when no timetable is published, so the impact cannot be computed. */
  warning: string | null;
}

/**
 * What a leave request actually costs, computed from the published timetable.
 *
 * Used by both the preview and the submission, so what the faculty member
 * confirms is exactly what gets stored — no chance of the preview and the
 * record disagreeing.
 */
export async function computeLeaveImpact(
  user: AuthContext,
  fromDate: string,
  toDate: string,
): Promise<LeaveImpact> {
  if (toDate < fromDate) {
    throw new AppError(
      'The last day of leave is before the first day.',
      400,
      'INVALID_RANGE',
      undefined,
      'Check the dates and try again.',
    );
  }

  const dates = eachDateInclusive(fromDate, toDate);
  if (dates.length === 0 || dates.length > 90) {
    throw new AppError(
      'Leave can be requested for up to 90 days at a time.',
      400,
      'RANGE_TOO_LONG',
    );
  }

  const term = await getCurrentTerm(user.institutionId);
  const versionId = term ? await getPublishedVersionId(user.institutionId, term.id) : null;

  const [holidayRows, cancellations] = await Promise.all([
    db
      .select({ date: t.holidays.date, name: t.holidays.name })
      .from(t.holidays)
      .where(
        and(
          eq(t.holidays.institutionId, user.institutionId),
          gte(t.holidays.date, fromDate),
          lte(t.holidays.date, toDate),
        ),
      ),
    db
      .select({
        entryId: t.scheduleExceptions.entryId,
        date: t.scheduleExceptions.date,
        kind: t.scheduleExceptions.kind,
      })
      .from(t.scheduleExceptions)
      .where(
        and(
          eq(t.scheduleExceptions.institutionId, user.institutionId),
          gte(t.scheduleExceptions.date, new Date(`${fromDate}T00:00:00.000Z`)),
          lte(t.scheduleExceptions.date, new Date(`${toDate}T23:59:59.999Z`)),
        ),
      ),
  ]);

  const holidayByDate = new Map(holidayRows.map((h) => [h.date, h.name]));

  if (!versionId) {
    return {
      classes: [],
      offeringIds: [],
      studentsAffected: 0,
      workingDays: dates.filter((d) => !holidayByDate.has(d)).length,
      holidays: holidayRows.map((h) => ({ date: h.date, name: h.name })),
      warning:
        'No timetable is published for the current term, so the classes affected by this leave cannot be listed. The request can still be submitted, but the approver will not see an impact list.',
    };
  }

  const schedule = await getMySchedule(user, versionId);
  const offeringIds = [...new Set(schedule.map((e) => e.offeringId))];

  const enrolCounts = offeringIds.length
    ? await db
        .select({
          offeringId: t.enrollments.offeringId,
          students: sql<number>`count(*)::int`,
        })
        .from(t.enrollments)
        .where(
          and(
            eq(t.enrollments.institutionId, user.institutionId),
            inArray(t.enrollments.offeringId, offeringIds),
            sql`${t.enrollments.droppedAt} is null`,
          ),
        )
        .groupBy(t.enrollments.offeringId)
    : [];
  const studentsBy = new Map(enrolCounts.map((r) => [r.offeringId, r.students]));

  const cancelledKeys = new Set(
    cancellations
      .filter((c) => c.kind === 'CANCELLED' && c.entryId)
      .map((c) => `${c.entryId}|${c.date.toISOString().slice(0, 10)}`),
  );

  const classes: AffectedClass[] = [];
  for (const date of dates) {
    const day = dayNameOf(fromISODate(date));
    const holiday = holidayByDate.get(date);
    for (const entry of schedule.filter((e) => e.dayOfWeek === day)) {
      const alreadyCancelled = entry.isCancelled || cancelledKeys.has(`${entry.entryId}|${date}`);
      classes.push({
        date,
        dayOfWeek: day,
        entryId: entry.entryId,
        offeringId: entry.offeringId,
        slotLabel: entry.slotLabel,
        startTime: entry.startTime,
        endTime: entry.endTime,
        subjectCode: entry.subjectCode,
        subjectName: entry.subjectName,
        sectionCode: entry.sectionCode,
        roomCode: entry.roomCode,
        studentCount: studentsBy.get(entry.offeringId) ?? 0,
        alreadyCovered: !!holiday || alreadyCancelled,
        coveredReason: holiday
          ? `Institution holiday: ${holiday}`
          : alreadyCancelled
            ? 'This period is already cancelled'
            : null,
      });
    }
  }

  const needingCover = classes.filter((c) => !c.alreadyCovered);
  const affectedOfferings = [...new Set(needingCover.map((c) => c.offeringId))];
  const studentsAffected = affectedOfferings.reduce(
    (sum, id) => sum + (studentsBy.get(id) ?? 0),
    0,
  );

  return {
    classes,
    offeringIds: affectedOfferings,
    studentsAffected,
    workingDays: dates.filter((d) => !holidayByDate.has(d)).length,
    holidays: holidayRows.map((h) => ({ date: h.date, name: h.name })),
    warning: null,
  };
}

/** Next human-facing reference, e.g. LEAVE-2026-00313. */
export async function nextLeaveReference(institutionId: string): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `LEAVE-${year}-`;
  const [row] = await db
    .select({
      highest: sql<string | null>`max(${t.leaveRequests.reference})`,
    })
    .from(t.leaveRequests)
    .where(
      and(
        eq(t.leaveRequests.institutionId, institutionId),
        sql`${t.leaveRequests.reference} like ${`${prefix}%`}`,
      ),
    );

  const current = row?.highest ? Number(row.highest.slice(prefix.length)) : 0;
  const next = Number.isFinite(current) ? current + 1 : 1;
  return `${prefix}${String(next).padStart(5, '0')}`;
}
