import 'server-only';
import { cache } from 'react';
import { and, asc, eq, inArray, isNull, or, sql, type SQL } from 'drizzle-orm';
import { db } from '@/lib/db';
import * as t from '@/lib/db/schema';
import { DAY_ORDER, type DayName } from './time';

/**
 * Shared data access for the student portal.
 *
 * Every helper is scoped by `institutionId` plus the caller's own
 * `studentProfileId` / `sectionId`, which the page supplies from its
 * `StudentContext`. Nothing here derives a tenant from user input.
 */

/** The institution's IANA timezone — "today" is always computed in it. */
export const getInstitutionTimezone = cache(async (institutionId: string): Promise<string> => {
  const [row] = await db
    .select({ timezone: t.institutions.timezone })
    .from(t.institutions)
    .where(eq(t.institutions.id, institutionId))
    .limit(1);
  return row?.timezone ?? 'Asia/Kolkata';
});

export interface TermInfo {
  id: string;
  name: string;
  semesterNumber: number;
  startDate: string;
  endDate: string;
  teachingEndDate: string | null;
}

export const getCurrentTerm = cache(async (institutionId: string): Promise<TermInfo | null> => {
  const [row] = await db
    .select({
      id: t.terms.id,
      name: t.terms.name,
      semesterNumber: t.terms.semesterNumber,
      startDate: t.terms.startDate,
      endDate: t.terms.endDate,
      teachingEndDate: t.terms.teachingEndDate,
    })
    .from(t.terms)
    .where(and(eq(t.terms.institutionId, institutionId), eq(t.terms.isCurrent, true)))
    .limit(1);
  return row ?? null;
});

export interface EnrolledOffering {
  offeringId: string;
  subjectId: string;
  code: string;
  name: string;
  kind: string;
  credits: number;
  minAttendancePercentage: number;
  facultyName: string | null;
}

/** The offerings this student is actually enrolled in (electives included). */
export const getEnrolledOfferings = cache(
  async (institutionId: string, studentId: string): Promise<EnrolledOffering[]> => {
    const rows = await db
      .select({
        offeringId: t.courseOfferings.id,
        subjectId: t.subjects.id,
        code: t.subjects.code,
        name: t.subjects.name,
        kind: t.subjects.kind,
        credits: t.subjects.credits,
        minAttendancePercentage: t.courseOfferings.minAttendancePercentage,
        firstName: t.users.firstName,
        lastName: t.users.lastName,
      })
      .from(t.enrollments)
      .innerJoin(t.courseOfferings, eq(t.courseOfferings.id, t.enrollments.offeringId))
      .innerJoin(t.subjects, eq(t.subjects.id, t.courseOfferings.subjectId))
      .leftJoin(t.facultyProfiles, eq(t.facultyProfiles.id, t.courseOfferings.facultyId))
      .leftJoin(t.users, eq(t.users.id, t.facultyProfiles.userId))
      .where(
        and(
          eq(t.enrollments.institutionId, institutionId),
          eq(t.enrollments.studentId, studentId),
          isNull(t.enrollments.droppedAt),
        ),
      )
      .orderBy(asc(t.subjects.code));

    return rows.map((r) => ({
      offeringId: r.offeringId,
      subjectId: r.subjectId,
      code: r.code,
      name: r.name,
      kind: r.kind,
      credits: r.credits,
      minAttendancePercentage: Number(r.minAttendancePercentage),
      facultyName: r.firstName ? `${r.firstName} ${r.lastName ?? ''}`.trim() : null,
    }));
  },
);

export interface PublishedTimetable {
  versionId: string;
  versionName: string;
  publishedAt: Date | null;
}

/**
 * The timetable a student is allowed to see. Drafts and proposals are invisible
 * by design: an unpublished plan is not a commitment the institution has made.
 */
export const getPublishedTimetable = cache(
  async (institutionId: string, termId: string): Promise<PublishedTimetable | null> => {
    const [row] = await db
      .select({
        versionId: t.timetableVersions.id,
        versionName: t.timetableVersions.name,
        publishedAt: t.timetableVersions.publishedAt,
      })
      .from(t.timetableVersions)
      .where(
        and(
          eq(t.timetableVersions.institutionId, institutionId),
          eq(t.timetableVersions.termId, termId),
          eq(t.timetableVersions.status, 'PUBLISHED'),
        ),
      )
      .limit(1);
    return row ?? null;
  },
);

export interface ClassEntry {
  entryId: string;
  offeringId: string;
  day: DayName;
  position: number;
  slotLabel: string;
  startTime: string;
  endTime: string;
  subjectCode: string;
  subjectName: string;
  subjectKind: string;
  roomCode: string | null;
  roomBuilding: string | null;
  facultyName: string | null;
  isCancelled: boolean;
  note: string | null;
}

/** Every scheduled period for this student's section in the published version. */
export const getWeeklyClasses = cache(
  async (institutionId: string, sectionId: string, versionId: string): Promise<ClassEntry[]> => {
    const rows = await db
      .select({
        entryId: t.timetableEntries.id,
        offeringId: t.timetableEntries.offeringId,
        day: t.timetableEntries.dayOfWeek,
        position: t.timeSlots.position,
        slotLabel: t.timeSlots.label,
        startTime: t.timeSlots.startTime,
        endTime: t.timeSlots.endTime,
        subjectCode: t.subjects.code,
        subjectName: t.subjects.name,
        subjectKind: t.subjects.kind,
        roomCode: t.rooms.code,
        roomBuilding: t.rooms.building,
        firstName: t.users.firstName,
        lastName: t.users.lastName,
        isCancelled: t.timetableEntries.isCancelled,
        note: t.timetableEntries.note,
      })
      .from(t.timetableEntries)
      .innerJoin(t.timeSlots, eq(t.timeSlots.id, t.timetableEntries.timeSlotId))
      .innerJoin(t.courseOfferings, eq(t.courseOfferings.id, t.timetableEntries.offeringId))
      .innerJoin(t.subjects, eq(t.subjects.id, t.courseOfferings.subjectId))
      .leftJoin(t.rooms, eq(t.rooms.id, t.timetableEntries.roomId))
      .leftJoin(t.facultyProfiles, eq(t.facultyProfiles.id, t.timetableEntries.facultyId))
      .leftJoin(t.users, eq(t.users.id, t.facultyProfiles.userId))
      .where(
        and(
          eq(t.timetableEntries.institutionId, institutionId),
          eq(t.timetableEntries.versionId, versionId),
          eq(t.timetableEntries.sectionId, sectionId),
        ),
      )
      .orderBy(asc(t.timeSlots.position));

    return rows
      .map((r) => ({
        entryId: r.entryId,
        offeringId: r.offeringId,
        day: r.day as DayName,
        position: r.position,
        slotLabel: r.slotLabel,
        startTime: r.startTime,
        endTime: r.endTime,
        subjectCode: r.subjectCode,
        subjectName: r.subjectName,
        subjectKind: r.subjectKind,
        roomCode: r.roomCode,
        roomBuilding: r.roomBuilding,
        facultyName: r.firstName ? `${r.firstName} ${r.lastName ?? ''}`.trim() : null,
        isCancelled: r.isCancelled,
        note: r.note,
      }))
      .sort(
        (a, b) =>
          DAY_ORDER.indexOf(a.day) - DAY_ORDER.indexOf(b.day) || a.position - b.position,
      );
  },
);

export interface PeriodRow {
  position: number;
  label: string;
  startTime: string;
  endTime: string;
  kind: string;
}

/** The institution's period grid, collapsed to one row per position. */
export const getPeriodGrid = cache(
  async (
    institutionId: string,
  ): Promise<{ periods: PeriodRow[]; days: DayName[]; slotDays: Set<string> }> => {
    const rows = await db
      .select({
        position: t.timeSlots.position,
        label: t.timeSlots.label,
        startTime: t.timeSlots.startTime,
        endTime: t.timeSlots.endTime,
        kind: t.timeSlots.kind,
        day: t.timeSlots.dayOfWeek,
      })
      .from(t.timeSlots)
      .where(eq(t.timeSlots.institutionId, institutionId))
      .orderBy(asc(t.timeSlots.position));

    const periods = new Map<number, PeriodRow>();
    const days = new Set<DayName>();
    const slotDays = new Set<string>();

    for (const row of rows) {
      days.add(row.day as DayName);
      slotDays.add(`${row.day}:${row.position}`);
      if (!periods.has(row.position)) {
        periods.set(row.position, {
          position: row.position,
          // Slot labels are day-prefixed ("MON Period 1"); the grid header is
          // shared across days, so keep only the period part.
          label: row.label.replace(/^[A-Z]{3}\s+/, ''),
          startTime: row.startTime,
          endTime: row.endTime,
          kind: row.kind,
        });
      }
    }

    return {
      periods: [...periods.values()].sort((a, b) => a.position - b.position),
      days: [...days].sort((a, b) => DAY_ORDER.indexOf(a) - DAY_ORDER.indexOf(b)),
      slotDays,
    };
  },
);

export interface ScheduleException {
  id: string;
  entryId: string | null;
  offeringId: string | null;
  date: Date;
  kind: string;
  reason: string;
  newRoomCode: string | null;
  newFacultyName: string | null;
  newSlotLabel: string | null;
  newSlotPosition: number | null;
  newSlotStartTime: string | null;
  newSlotEndTime: string | null;
  subjectCode: string | null;
  subjectName: string | null;
  /** `YYYY-MM-DD` of the affected day. */
  dateIso: string;
}

/** One-off deviations that touch this student's own classes, in a date window. */
export async function getScheduleExceptions(
  institutionId: string,
  offeringIds: string[],
  entryIds: string[],
  fromIso: string,
  toIso: string,
): Promise<ScheduleException[]> {
  if (offeringIds.length === 0 && entryIds.length === 0) return [];

  const scope: SQL[] = [];
  if (offeringIds.length) scope.push(inArray(t.scheduleExceptions.offeringId, offeringIds));
  if (entryIds.length) scope.push(inArray(t.scheduleExceptions.entryId, entryIds));

  const rows = await db
    .select({
      id: t.scheduleExceptions.id,
      entryId: t.scheduleExceptions.entryId,
      offeringId: t.scheduleExceptions.offeringId,
      date: t.scheduleExceptions.date,
      kind: t.scheduleExceptions.kind,
      reason: t.scheduleExceptions.reason,
      newRoomCode: t.rooms.code,
      newSlotLabel: t.timeSlots.label,
      newSlotPosition: t.timeSlots.position,
      newSlotStartTime: t.timeSlots.startTime,
      newSlotEndTime: t.timeSlots.endTime,
      subjectCode: t.subjects.code,
      subjectName: t.subjects.name,
      firstName: t.users.firstName,
      lastName: t.users.lastName,
    })
    .from(t.scheduleExceptions)
    .leftJoin(t.rooms, eq(t.rooms.id, t.scheduleExceptions.newRoomId))
    .leftJoin(t.timeSlots, eq(t.timeSlots.id, t.scheduleExceptions.newTimeSlotId))
    .leftJoin(t.facultyProfiles, eq(t.facultyProfiles.id, t.scheduleExceptions.newFacultyId))
    .leftJoin(t.users, eq(t.users.id, t.facultyProfiles.userId))
    .leftJoin(t.courseOfferings, eq(t.courseOfferings.id, t.scheduleExceptions.offeringId))
    .leftJoin(t.subjects, eq(t.subjects.id, t.courseOfferings.subjectId))
    .where(
      and(
        eq(t.scheduleExceptions.institutionId, institutionId),
        sql`${t.scheduleExceptions.date} >= ${`${fromIso}T00:00:00Z`}`,
        sql`${t.scheduleExceptions.date} < ${`${toIso}T00:00:00Z`}`,
        or(...scope),
      ),
    )
    .orderBy(asc(t.scheduleExceptions.date));

  return rows.map((r) => ({
    id: r.id,
    entryId: r.entryId,
    offeringId: r.offeringId,
    date: r.date,
    kind: r.kind,
    reason: r.reason,
    newRoomCode: r.newRoomCode,
    newFacultyName: r.firstName ? `${r.firstName} ${r.lastName ?? ''}`.trim() : null,
    newSlotLabel: r.newSlotLabel,
    newSlotPosition: r.newSlotPosition,
    newSlotStartTime: r.newSlotStartTime,
    newSlotEndTime: r.newSlotEndTime,
    subjectCode: r.subjectCode,
    subjectName: r.subjectName,
    dateIso: r.date.toISOString().slice(0, 10),
  }));
}

export interface AttendanceRow {
  offeringId: string;
  code: string;
  name: string;
  facultyName: string | null;
  heldSessions: number;
  attendedSessions: number;
  percentageBp: number;
  isBelowThreshold: boolean;
  absenceHeadroom: number;
  requiredPercentage: number;
  /** Consecutive future classes needed to climb back to the minimum. */
  sessionsToRecover: number;
  recomputedAt: Date | null;
}

export const getAttendanceRows = cache(
  async (institutionId: string, studentId: string): Promise<AttendanceRow[]> => {
    const offerings = await getEnrolledOfferings(institutionId, studentId);
    if (offerings.length === 0) return [];

    const summaries = await db
      .select()
      .from(t.attendanceSummaries)
      .where(
        and(
          eq(t.attendanceSummaries.institutionId, institutionId),
          eq(t.attendanceSummaries.studentId, studentId),
        ),
      );

    const byOffering = new Map(summaries.map((s) => [s.offeringId, s]));

    return offerings.map((offering) => {
      const summary = byOffering.get(offering.offeringId);
      const held = summary?.heldSessions ?? 0;
      const attended = summary?.attendedSessions ?? 0;
      const required = offering.minAttendancePercentage;

      return {
        offeringId: offering.offeringId,
        code: offering.code,
        name: offering.name,
        facultyName: offering.facultyName,
        heldSessions: held,
        attendedSessions: attended,
        percentageBp: summary?.percentageBp ?? 0,
        isBelowThreshold: summary?.isBelowThreshold ?? false,
        absenceHeadroom: summary?.absenceHeadroom ?? 0,
        requiredPercentage: required,
        sessionsToRecover: sessionsToRecover(attended, held, required),
        recomputedAt: summary?.recomputedAt ?? null,
      };
    });
  },
);

/**
 * How many consecutive classes must be attended to reach the minimum.
 * Solves (attended + x) / (held + x) >= required. Derived from the same held /
 * attended counts shown on screen — nothing here is estimated.
 */
export function sessionsToRecover(attended: number, held: number, requiredPct: number): number {
  if (held === 0) return 0;
  const required = requiredPct / 100;
  if (attended / held >= required) return 0;
  if (required >= 1) return Infinity;
  return Math.max(0, Math.ceil((required * held - attended) / (1 - required)));
}

export interface AttendanceOverall {
  held: number;
  attended: number;
  percentageBp: number;
  atRisk: AttendanceRow[];
}

export function summariseAttendance(rows: AttendanceRow[]): AttendanceOverall {
  const held = rows.reduce((n, r) => n + r.heldSessions, 0);
  const attended = rows.reduce((n, r) => n + r.attendedSessions, 0);
  return {
    held,
    attended,
    percentageBp: held === 0 ? 0 : Math.round((attended / held) * 10_000),
    atRisk: rows
      .filter((r) => r.heldSessions > 0 && r.isBelowThreshold)
      .sort((a, b) => a.percentageBp - b.percentageBp),
  };
}

/** Tone for an attendance percentage against its own subject threshold. */
export function attendanceTone(
  percentageBp: number,
  requiredPct: number,
): 'success' | 'warning' | 'danger' {
  const required = requiredPct * 100;
  if (percentageBp >= required) return percentageBp >= required + 500 ? 'success' : 'warning';
  return 'danger';
}
