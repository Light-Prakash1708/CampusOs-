import 'server-only';
import { and, asc, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import * as t from '@/lib/db/schema';
import type { AuthContext } from '@/lib/auth/context';

/**
 * FACULTY PORTAL — shared server-side reads.
 *
 * Everything here is scoped by `user.institutionId` and, where the data is
 * faculty-owned, by `user.facultyProfileId`. Nothing in this file invents a
 * value: if the database has no row, the caller gets an empty result and the
 * page renders an honest empty state.
 */

export const WEEK_DAYS = [
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
] as const;

export type DayName = (typeof WEEK_DAYS)[number] | 'SUNDAY';

const DAY_BY_INDEX: DayName[] = [
  'SUNDAY',
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
];

export function dayNameOf(date: Date): DayName {
  return DAY_BY_INDEX[date.getDay()] as DayName;
}

/** "2026-08-20" for a Date, using local calendar fields (no UTC shift). */
export function toISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Parses "2026-08-20" as local midday so day-of-week is never off by one. */
export function fromISODate(value: string): Date {
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1, 12, 0, 0, 0);
}

export function isISODate(value: string | undefined | null): value is string {
  return !!value && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function eachDateInclusive(fromISO: string, toISO: string): string[] {
  const out: string[] = [];
  const end = fromISODate(toISO).getTime();
  const cursor = fromISODate(fromISO);
  // Bounded so a bad range can never spin: one academic year is the ceiling.
  for (let i = 0; i < 400 && cursor.getTime() <= end; i += 1) {
    out.push(toISODate(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
}

/* ------------------------------- Term / version --------------------------- */

export interface TermInfo {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
}

export async function getCurrentTerm(institutionId: string): Promise<TermInfo | null> {
  const [term] = await db
    .select({
      id: t.terms.id,
      name: t.terms.name,
      startDate: t.terms.startDate,
      endDate: t.terms.endDate,
    })
    .from(t.terms)
    .where(and(eq(t.terms.institutionId, institutionId), eq(t.terms.isCurrent, true)))
    .limit(1);
  return term ?? null;
}

/** The published timetable version for a term, or null when none is published. */
export async function getPublishedVersionId(
  institutionId: string,
  termId: string,
): Promise<string | null> {
  const [version] = await db
    .select({ id: t.timetableVersions.id })
    .from(t.timetableVersions)
    .where(
      and(
        eq(t.timetableVersions.institutionId, institutionId),
        eq(t.timetableVersions.termId, termId),
        eq(t.timetableVersions.status, 'PUBLISHED'),
      ),
    )
    .limit(1);
  return version?.id ?? null;
}

/* --------------------------------- Offerings ------------------------------ */

export interface FacultyOffering {
  id: string;
  termId: string;
  subjectId: string;
  subjectCode: string;
  subjectName: string;
  subjectKind: string;
  sectionId: string;
  sectionCode: string;
  sectionName: string;
  programName: string;
  minAttendancePercentage: string;
  isPrimaryTeacher: boolean;
}

/**
 * Offerings this faculty member teaches in the given term (current term when
 * omitted). Includes offerings where they are the secondary/lab teacher.
 */
export async function getMyOfferings(
  user: AuthContext,
  termId?: string | null,
): Promise<FacultyOffering[]> {
  if (!user.facultyProfileId) return [];

  const rows = await db
    .select({
      id: t.courseOfferings.id,
      termId: t.courseOfferings.termId,
      facultyId: t.courseOfferings.facultyId,
      subjectId: t.subjects.id,
      subjectCode: t.subjects.code,
      subjectName: t.subjects.name,
      subjectKind: t.subjects.kind,
      sectionId: t.sections.id,
      sectionCode: t.sections.code,
      sectionName: t.sections.name,
      programName: t.programs.name,
      minAttendancePercentage: t.courseOfferings.minAttendancePercentage,
    })
    .from(t.courseOfferings)
    .innerJoin(t.subjects, eq(t.subjects.id, t.courseOfferings.subjectId))
    .innerJoin(t.sections, eq(t.sections.id, t.courseOfferings.sectionId))
    .innerJoin(t.programs, eq(t.programs.id, t.sections.programId))
    .where(
      and(
        eq(t.courseOfferings.institutionId, user.institutionId),
        eq(t.courseOfferings.isActive, true),
        isNull(t.courseOfferings.deletedAt),
        termId ? eq(t.courseOfferings.termId, termId) : undefined,
        or(
          eq(t.courseOfferings.facultyId, user.facultyProfileId),
          eq(t.courseOfferings.secondaryFacultyId, user.facultyProfileId),
        ),
      ),
    )
    .orderBy(asc(t.subjects.code), asc(t.sections.code));

  return rows.map((r) => ({
    id: r.id,
    termId: r.termId,
    subjectId: r.subjectId,
    subjectCode: r.subjectCode,
    subjectName: r.subjectName,
    subjectKind: r.subjectKind,
    sectionId: r.sectionId,
    sectionCode: r.sectionCode,
    sectionName: r.sectionName,
    programName: r.programName,
    minAttendancePercentage: r.minAttendancePercentage,
    isPrimaryTeacher: r.facultyId === user.facultyProfileId,
  }));
}

/** Throws nothing — returns [] so callers can render an empty state. */
export async function getMyOfferingIds(user: AuthContext, termId?: string | null): Promise<string[]> {
  return (await getMyOfferings(user, termId)).map((o) => o.id);
}

/* --------------------------------- Schedule ------------------------------- */

export interface ScheduleEntry {
  entryId: string;
  offeringId: string;
  dayOfWeek: DayName;
  timeSlotId: string;
  slotLabel: string;
  position: number;
  startTime: string;
  endTime: string;
  roomId: string | null;
  roomCode: string | null;
  roomBuilding: string | null;
  sectionId: string;
  sectionCode: string;
  subjectCode: string;
  subjectName: string;
  isCancelled: boolean;
  note: string | null;
}

export async function getMySchedule(
  user: AuthContext,
  versionId: string,
): Promise<ScheduleEntry[]> {
  if (!user.facultyProfileId) return [];

  const rows = await db
    .select({
      entryId: t.timetableEntries.id,
      offeringId: t.timetableEntries.offeringId,
      dayOfWeek: t.timetableEntries.dayOfWeek,
      timeSlotId: t.timeSlots.id,
      slotLabel: t.timeSlots.label,
      position: t.timeSlots.position,
      startTime: t.timeSlots.startTime,
      endTime: t.timeSlots.endTime,
      roomId: t.rooms.id,
      roomCode: t.rooms.code,
      roomBuilding: t.rooms.building,
      sectionId: t.sections.id,
      sectionCode: t.sections.code,
      subjectCode: t.subjects.code,
      subjectName: t.subjects.name,
      isCancelled: t.timetableEntries.isCancelled,
      note: t.timetableEntries.note,
    })
    .from(t.timetableEntries)
    .innerJoin(t.timeSlots, eq(t.timeSlots.id, t.timetableEntries.timeSlotId))
    .innerJoin(t.sections, eq(t.sections.id, t.timetableEntries.sectionId))
    .innerJoin(t.courseOfferings, eq(t.courseOfferings.id, t.timetableEntries.offeringId))
    .innerJoin(t.subjects, eq(t.subjects.id, t.courseOfferings.subjectId))
    .leftJoin(t.rooms, eq(t.rooms.id, t.timetableEntries.roomId))
    .where(
      and(
        eq(t.timetableEntries.institutionId, user.institutionId),
        eq(t.timetableEntries.versionId, versionId),
        eq(t.timetableEntries.facultyId, user.facultyProfileId),
      ),
    )
    .orderBy(asc(t.timeSlots.position));

  return rows.map((r) => ({ ...r, dayOfWeek: r.dayOfWeek as DayName }));
}

/** Teaching periods on the institution's grid, one row per position. */
export async function getSlotGrid(institutionId: string) {
  const rows = await db
    .select({
      position: t.timeSlots.position,
      startTime: t.timeSlots.startTime,
      endTime: t.timeSlots.endTime,
      kind: t.timeSlots.kind,
    })
    .from(t.timeSlots)
    .where(and(eq(t.timeSlots.institutionId, institutionId), eq(t.timeSlots.dayOfWeek, 'MONDAY')))
    .orderBy(asc(t.timeSlots.position));
  return rows;
}

/* ------------------------------- Availability ----------------------------- */

export interface AvailabilityWindow {
  day: string;
  from: string;
  to: string;
}

export async function getMyFacultyProfile(user: AuthContext) {
  if (!user.facultyProfileId) return null;
  const [row] = await db
    .select({
      id: t.facultyProfiles.id,
      employeeCode: t.facultyProfiles.employeeCode,
      designation: t.facultyProfiles.designation,
      departmentId: t.facultyProfiles.departmentId,
      departmentName: t.departments.name,
      specializations: t.facultyProfiles.specializations,
      qualifications: t.facultyProfiles.qualifications,
      joiningDate: t.facultyProfiles.joiningDate,
      employmentType: t.facultyProfiles.employmentType,
      maxWeeklyTeachingHours: t.facultyProfiles.maxWeeklyTeachingHours,
      availability: t.facultyProfiles.availability,
      constraintNotes: t.facultyProfiles.constraintNotes,
      isAvailableForSubstitution: t.facultyProfiles.isAvailableForSubstitution,
    })
    .from(t.facultyProfiles)
    .innerJoin(t.departments, eq(t.departments.id, t.facultyProfiles.departmentId))
    .where(
      and(
        eq(t.facultyProfiles.id, user.facultyProfileId),
        eq(t.facultyProfiles.institutionId, user.institutionId),
      ),
    )
    .limit(1);
  return row ?? null;
}

/** Days with no availability window at all — the faculty member is off. */
export function unavailableDays(windows: AvailabilityWindow[]): DayName[] {
  if (windows.length === 0) return [];
  const covered = new Set(windows.map((w) => w.day));
  return WEEK_DAYS.filter((d) => !covered.has(d));
}

/**
 * True when a scheduled period falls outside every declared availability
 * window for its day. Used to flag a clash between the timetable and the
 * constraint the faculty member registered.
 */
export function isOutsideAvailability(
  windows: AvailabilityWindow[],
  day: DayName,
  startTime: string,
  endTime: string,
): boolean {
  if (windows.length === 0) return false;
  const forDay = windows.filter((w) => w.day === day);
  if (forDay.length === 0) return true;
  const start = startTime.slice(0, 5);
  const end = endTime.slice(0, 5);
  return !forDay.some((w) => start >= w.from.slice(0, 5) && end <= w.to.slice(0, 5));
}

/* ---------------------------- Pending grading ----------------------------- */

export const PENDING_SUBMISSION_STATES = ['SUBMITTED', 'LATE', 'RESUBMITTED'] as const;

export async function countPendingGrading(
  user: AuthContext,
  offeringIds: string[],
): Promise<number> {
  if (offeringIds.length === 0) return 0;
  const [row] = await db
    .select({ value: sql<number>`count(*)::int` })
    .from(t.submissions)
    .innerJoin(t.assignments, eq(t.assignments.id, t.submissions.assignmentId))
    .where(
      and(
        eq(t.submissions.institutionId, user.institutionId),
        inArray(t.assignments.offeringId, offeringIds),
        inArray(t.submissions.status, [...PENDING_SUBMISSION_STATES]),
      ),
    );
  return row?.value ?? 0;
}

/**
 * Badge tone for each grievance status. Lives here rather than in a page file
 * because Next.js only permits specific exports from `page.tsx`.
 */
export const GRIEVANCE_STATUS_TONE: Record<
  string,
  'success' | 'warning' | 'danger' | 'neutral' | 'info'
> = {
  SUBMITTED: 'info',
  ACKNOWLEDGED: 'info',
  ASSIGNED: 'warning',
  UNDER_REVIEW: 'warning',
  AWAITING_INFORMATION: 'warning',
  RESOLUTION_PROPOSED: 'brand' as 'info',
  RESOLVED: 'success',
  CLOSED: 'neutral',
  REOPENED: 'danger',
  WITHDRAWN: 'neutral',
};
