import 'server-only';
import { and, asc, count, desc, eq, gte, inArray, isNull, or, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import * as t from '@/lib/db/schema';

/**
 * ADMIN PORTAL — shared server-side reads.
 *
 * Every function is tenant-scoped by an explicit `institutionId` argument.
 * None of them invent values: when there is no data the caller gets an empty
 * result and renders an honest empty state.
 */

export const WEEK_DAYS = [
  'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY',
] as const;

export type DayName = (typeof WEEK_DAYS)[number] | 'SUNDAY';

const DAY_BY_INDEX: DayName[] = [
  'SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY',
];

export function dayNameOf(date: Date): DayName {
  return DAY_BY_INDEX[date.getDay()] as DayName;
}

export function toISODate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export async function getCurrentTerm(institutionId: string) {
  const [term] = await db
    .select()
    .from(t.terms)
    .where(and(eq(t.terms.institutionId, institutionId), eq(t.terms.isCurrent, true)))
    .limit(1);
  return term ?? null;
}

export async function getPublishedVersion(institutionId: string, termId?: string) {
  const [version] = await db
    .select()
    .from(t.timetableVersions)
    .where(
      and(
        eq(t.timetableVersions.institutionId, institutionId),
        eq(t.timetableVersions.status, 'PUBLISHED'),
        termId ? eq(t.timetableVersions.termId, termId) : sql`true`,
      ),
    )
    .limit(1);
  return version ?? null;
}

/** Institution-wide headline counts for the executive dashboard. */
export async function getInstitutionCounts(institutionId: string) {
  const [students, faculty, departments, programs, sections, subjects, rooms] = await Promise.all([
    db.select({ v: count() }).from(t.studentProfiles).where(
      and(eq(t.studentProfiles.institutionId, institutionId), isNull(t.studentProfiles.deletedAt)),
    ),
    db.select({ v: count() }).from(t.facultyProfiles).where(
      and(eq(t.facultyProfiles.institutionId, institutionId), isNull(t.facultyProfiles.deletedAt)),
    ),
    db.select({ v: count() }).from(t.departments).where(
      and(eq(t.departments.institutionId, institutionId), isNull(t.departments.deletedAt)),
    ),
    db.select({ v: count() }).from(t.programs).where(
      and(eq(t.programs.institutionId, institutionId), isNull(t.programs.deletedAt)),
    ),
    db.select({ v: count() }).from(t.sections).where(
      and(eq(t.sections.institutionId, institutionId), isNull(t.sections.deletedAt)),
    ),
    db.select({ v: count() }).from(t.subjects).where(
      and(eq(t.subjects.institutionId, institutionId), isNull(t.subjects.deletedAt)),
    ),
    db.select({ v: count() }).from(t.rooms).where(
      and(eq(t.rooms.institutionId, institutionId), isNull(t.rooms.deletedAt)),
    ),
  ]);

  return {
    students: students[0]?.v ?? 0,
    faculty: faculty[0]?.v ?? 0,
    departments: departments[0]?.v ?? 0,
    programs: programs[0]?.v ?? 0,
    sections: sections[0]?.v ?? 0,
    subjects: subjects[0]?.v ?? 0,
    rooms: rooms[0]?.v ?? 0,
  };
}

/** Classes running right now, derived from the published timetable. */
export async function getClassesInProgress(institutionId: string, now = new Date()) {
  const version = await getPublishedVersion(institutionId);
  if (!version) return [];

  const day = dayNameOf(now);
  const hhmm = now.toTimeString().slice(0, 8);

  return db
    .select({
      id: t.timetableEntries.id,
      subjectCode: t.subjects.code,
      subjectName: t.subjects.name,
      sectionCode: t.sections.code,
      strength: t.sections.strength,
      roomCode: t.rooms.code,
      start: t.timeSlots.startTime,
      end: t.timeSlots.endTime,
      facultyFirst: t.users.firstName,
      facultyLast: t.users.lastName,
    })
    .from(t.timetableEntries)
    .innerJoin(t.timeSlots, eq(t.timeSlots.id, t.timetableEntries.timeSlotId))
    .innerJoin(t.courseOfferings, eq(t.courseOfferings.id, t.timetableEntries.offeringId))
    .innerJoin(t.subjects, eq(t.subjects.id, t.courseOfferings.subjectId))
    .innerJoin(t.sections, eq(t.sections.id, t.timetableEntries.sectionId))
    .leftJoin(t.rooms, eq(t.rooms.id, t.timetableEntries.roomId))
    .leftJoin(t.facultyProfiles, eq(t.facultyProfiles.id, t.timetableEntries.facultyId))
    .leftJoin(t.users, eq(t.users.id, t.facultyProfiles.userId))
    .where(
      and(
        eq(t.timetableEntries.versionId, version.id),
        eq(t.timetableEntries.dayOfWeek, day as never),
        eq(t.timetableEntries.isCancelled, false),
        sql`${t.timeSlots.startTime} <= ${hhmm}`,
        sql`${t.timeSlots.endTime} > ${hhmm}`,
      ),
    )
    .orderBy(asc(t.timeSlots.position));
}

export async function getPendingApprovals(institutionId: string, userId: string) {
  return db
    .select({
      id: t.approvals.id,
      kind: t.approvals.kind,
      title: t.approvals.title,
      description: t.approvals.description,
      impactSummary: t.approvals.impactSummary,
      createdAt: t.approvals.createdAt,
      requesterFirst: t.users.firstName,
      requesterLast: t.users.lastName,
    })
    .from(t.approvals)
    .leftJoin(t.users, eq(t.users.id, t.approvals.requestedById))
    .where(
      and(
        eq(t.approvals.institutionId, institutionId),
        eq(t.approvals.status, 'PENDING'),
        or(isNull(t.approvals.assignedApproverId), eq(t.approvals.assignedApproverId, userId)),
      ),
    )
    .orderBy(desc(t.approvals.createdAt))
    .limit(20);
}

export async function getRecentChanges(institutionId: string, limit = 12) {
  return db
    .select({
      id: t.changeEvents.id,
      kind: t.changeEvents.kind,
      title: t.changeEvents.title,
      summary: t.changeEvents.summary,
      reason: t.changeEvents.reason,
      affectedCount: t.changeEvents.affectedCount,
      createdAt: t.changeEvents.createdAt,
      byFirst: t.users.firstName,
      byLast: t.users.lastName,
    })
    .from(t.changeEvents)
    .leftJoin(t.users, eq(t.users.id, t.changeEvents.changedById))
    .where(eq(t.changeEvents.institutionId, institutionId))
    .orderBy(desc(t.changeEvents.createdAt))
    .limit(limit);
}

export async function getDepartments(institutionId: string) {
  return db
    .select({
      id: t.departments.id,
      code: t.departments.code,
      name: t.departments.name,
      school: t.departments.school,
    })
    .from(t.departments)
    .where(and(eq(t.departments.institutionId, institutionId), isNull(t.departments.deletedAt)))
    .orderBy(asc(t.departments.code));
}

export async function getSections(institutionId: string) {
  return db
    .select({
      id: t.sections.id,
      code: t.sections.code,
      name: t.sections.name,
      year: t.sections.year,
      semester: t.sections.semester,
      strength: t.sections.strength,
      programCode: t.programs.code,
      programName: t.programs.name,
      departmentCode: t.departments.code,
      homeRoomCode: t.rooms.code,
    })
    .from(t.sections)
    .innerJoin(t.programs, eq(t.programs.id, t.sections.programId))
    .innerJoin(t.departments, eq(t.departments.id, t.programs.departmentId))
    .leftJoin(t.rooms, eq(t.rooms.id, t.sections.homeRoomId))
    .where(and(eq(t.sections.institutionId, institutionId), isNull(t.sections.deletedAt)))
    .orderBy(asc(t.sections.code));
}

/** Staff who can be assigned a grievance case. */
export async function getAssignableStaff(institutionId: string) {
  return db
    .select({
      id: t.users.id,
      firstName: t.users.firstName,
      lastName: t.users.lastName,
      role: t.users.role,
      departmentCode: t.departments.code,
    })
    .from(t.users)
    .leftJoin(t.departments, eq(t.departments.id, t.users.departmentId))
    .where(
      and(
        eq(t.users.institutionId, institutionId),
        eq(t.users.status, 'ACTIVE'),
        isNull(t.users.deletedAt),
        inArray(t.users.role, [
          'ADMIN', 'SUPER_ADMIN', 'HOD', 'DEPARTMENT_ADMIN', 'EXAM_CELL',
          'COUNSELLOR', 'IT_SUPPORT', 'FINANCE', 'HR', 'LIBRARY', 'FACULTY',
        ]),
      ),
    )
    .orderBy(asc(t.users.firstName))
    .limit(200);
}

/** Unacknowledged-notice pressure: notices still waiting on people. */
export async function getOutstandingAcknowledgements(institutionId: string) {
  return db
    .select({
      id: t.announcements.id,
      reference: t.announcements.reference,
      title: t.announcements.title,
      recipientCount: t.announcements.recipientCount,
      acknowledgedCount: t.announcements.acknowledgedCount,
      deadline: t.announcements.acknowledgementDeadline,
      priority: t.announcements.priority,
    })
    .from(t.announcements)
    .where(
      and(
        eq(t.announcements.institutionId, institutionId),
        eq(t.announcements.status, 'PUBLISHED'),
        eq(t.announcements.requiresAcknowledgement, true),
        sql`${t.announcements.acknowledgedCount} < ${t.announcements.recipientCount}`,
      ),
    )
    .orderBy(desc(t.announcements.publishedAt))
    .limit(6);
}
