import 'server-only';
import { and, eq, desc, gte, inArray, isNull, sql, count, lt } from 'drizzle-orm';
import { db } from '@/lib/db';
import * as t from '@/lib/db/schema';
import type { AuthContext } from '@/lib/auth/context';
import type { AiTool, Citation, ToolResult } from './types';
import { actionAvailable, proposeAction, type ActionOperation } from './actions';

/**
 * AI TOOL REGISTRY
 * ---------------------------------------------------------------------------
 * The model has NO direct database access. It can only call these functions,
 * and each one:
 *
 *   1. is offered only if the caller holds the required capability
 *   2. derives its tenant and subject from the AuthContext, never from model
 *      -supplied ids (a model cannot ask for "student X's attendance")
 *   3. returns citations so the answer can point at real records
 *
 * Nothing here changes a record. The three `propose_*` tools (mutating: true)
 * only RECORD a proposal through `actions.ts`; the person then confirms or
 * dismisses it in the app, and only the confirmation runs the change.
 */

export interface ToolContext {
  user: AuthContext;
  /** The conversation the proposal belongs to (so the UI can show it there). */
  conversationId?: string | null;
}

type ToolHandler = (
  input: Record<string, unknown>,
  ctx: ToolContext,
) => Promise<{ content: unknown; citations?: Citation[] }>;

interface RegisteredTool extends AiTool {
  handler: ToolHandler;
  /** Extra availability check beyond the permission (feature flags, portal). */
  available?: (user: AuthContext) => boolean;
}

const DAY_NAMES = ['SUNDAY','MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY'] as const;

function resolveDay(input: Record<string, unknown>): string | null {
  const raw = String(input.day ?? '').toUpperCase();
  if (DAY_NAMES.includes(raw as never)) return raw;
  const now = new Date();
  if (raw === 'TOMORROW') return DAY_NAMES[(now.getDay() + 1) % 7]!;
  if (raw === 'TODAY' || raw === '') return DAY_NAMES[now.getDay()]!;
  return null;
}

/* ------------------------------ tool bodies ------------------------------- */

const getSchedule: RegisteredTool = {
  name: 'get_schedule',
  description:
    'Return the caller\'s own class schedule. For students this is their section timetable; for faculty it is the classes they teach. Optionally filter to a single day.',
  requiredPermission: 'timetable:view_own',
  inputSchema: {
    type: 'object',
    properties: {
      day: {
        type: 'string',
        description: 'MONDAY..SATURDAY, or TODAY / TOMORROW. Omit for the whole week.',
      },
    },
  },
  handler: async (input, { user }) => {
    const day = input.day ? resolveDay(input) : null;

    const rows = await db
      .select({
        subjectCode: t.subjects.code,
        subjectName: t.subjects.name,
        sectionCode: t.sections.code,
        day: t.timetableEntries.dayOfWeek,
        start: t.timeSlots.startTime,
        end: t.timeSlots.endTime,
        position: t.timeSlots.position,
        roomCode: t.rooms.code,
        facultyFirst: t.users.firstName,
        facultyLast: t.users.lastName,
      })
      .from(t.timetableEntries)
      .innerJoin(t.timetableVersions, eq(t.timetableVersions.id, t.timetableEntries.versionId))
      .innerJoin(t.courseOfferings, eq(t.courseOfferings.id, t.timetableEntries.offeringId))
      .innerJoin(t.subjects, eq(t.subjects.id, t.courseOfferings.subjectId))
      .innerJoin(t.sections, eq(t.sections.id, t.timetableEntries.sectionId))
      .innerJoin(t.timeSlots, eq(t.timeSlots.id, t.timetableEntries.timeSlotId))
      .leftJoin(t.rooms, eq(t.rooms.id, t.timetableEntries.roomId))
      .leftJoin(t.facultyProfiles, eq(t.facultyProfiles.id, t.timetableEntries.facultyId))
      .leftJoin(t.users, eq(t.users.id, t.facultyProfiles.userId))
      .where(
        and(
          eq(t.timetableEntries.institutionId, user.institutionId),
          eq(t.timetableVersions.status, 'PUBLISHED'),
          eq(t.timetableEntries.isCancelled, false),
          user.sectionId ? eq(t.timetableEntries.sectionId, user.sectionId) : sql`true`,
          user.facultyProfileId
            ? eq(t.timetableEntries.facultyId, user.facultyProfileId)
            : sql`true`,
          day ? eq(t.timetableEntries.dayOfWeek, day as never) : sql`true`,
        ),
      )
      .orderBy(t.timeSlots.position);

    return {
      content: {
        scope: day ?? 'week',
        classes: rows.map((r) => ({
          subject: `${r.subjectCode} ${r.subjectName}`,
          section: r.sectionCode,
          day: r.day,
          time: `${r.start.slice(0, 5)}–${r.end.slice(0, 5)}`,
          room: r.roomCode ?? 'To be confirmed',
          faculty: r.facultyFirst ? `${r.facultyFirst} ${r.facultyLast ?? ''}`.trim() : null,
        })),
      },
      citations: [{ type: 'timetable', label: 'Published timetable', href: `/${user.portal}/schedule` }],
    };
  },
};

const getAttendance: RegisteredTool = {
  name: 'get_attendance',
  description:
    'Return the calling student\'s attendance percentage per subject, including which subjects are below the required minimum and how many more classes they can miss.',
  requiredPermission: 'attendance:view_own',
  inputSchema: { type: 'object', properties: {} },
  handler: async (_input, { user }) => {
    if (!user.studentProfileId) {
      return { content: { error: 'Attendance lookup is only available for student accounts.' } };
    }

    const rows = await db
      .select({
        subjectCode: t.subjects.code,
        subjectName: t.subjects.name,
        held: t.attendanceSummaries.heldSessions,
        attended: t.attendanceSummaries.attendedSessions,
        percentageBp: t.attendanceSummaries.percentageBp,
        below: t.attendanceSummaries.isBelowThreshold,
        headroom: t.attendanceSummaries.absenceHeadroom,
        minimum: t.courseOfferings.minAttendancePercentage,
      })
      .from(t.attendanceSummaries)
      .innerJoin(t.courseOfferings, eq(t.courseOfferings.id, t.attendanceSummaries.offeringId))
      .innerJoin(t.subjects, eq(t.subjects.id, t.courseOfferings.subjectId))
      .where(eq(t.attendanceSummaries.studentId, user.studentProfileId));

    const overallHeld = rows.reduce((n, r) => n + r.held, 0);
    const overallAttended = rows.reduce((n, r) => n + r.attended, 0);

    return {
      content: {
        overallPercentage: overallHeld ? Math.round((overallAttended / overallHeld) * 1000) / 10 : 0,
        requiredMinimum: 75,
        subjects: rows.map((r) => ({
          subject: `${r.subjectCode} ${r.subjectName}`,
          percentage: r.percentageBp / 100,
          attended: r.attended,
          held: r.held,
          belowRequirement: r.below,
          canStillMiss: r.headroom,
        })),
      },
      citations: [
        { type: 'attendance', label: 'Your attendance record', href: '/student/attendance' },
      ],
    };
  },
};

const getAssignments: RegisteredTool = {
  name: 'get_assignments',
  description:
    'Return assignments relevant to the caller with their deadlines and submission status.',
  inputSchema: {
    type: 'object',
    properties: {
      onlyPending: { type: 'boolean', description: 'Restrict to not-yet-submitted work.' },
    },
  },
  handler: async (input, { user }) => {
    if (user.studentProfileId) {
      const rows = await db
        .select({
          title: t.assignments.title,
          dueAt: t.assignments.dueAt,
          maxScore: t.assignments.maxScore,
          subjectCode: t.subjects.code,
          status: t.submissions.status,
          score: t.submissions.score,
        })
        .from(t.assignments)
        .innerJoin(t.courseOfferings, eq(t.courseOfferings.id, t.assignments.offeringId))
        .innerJoin(t.subjects, eq(t.subjects.id, t.courseOfferings.subjectId))
        .innerJoin(t.enrollments, eq(t.enrollments.offeringId, t.assignments.offeringId))
        .leftJoin(
          t.submissions,
          and(
            eq(t.submissions.assignmentId, t.assignments.id),
            eq(t.submissions.studentId, user.studentProfileId),
          ),
        )
        .where(
          and(
            eq(t.enrollments.studentId, user.studentProfileId),
            eq(t.assignments.status, 'PUBLISHED'),
            isNull(t.assignments.deletedAt),
          ),
        )
        .orderBy(t.assignments.dueAt);

      const filtered = input.onlyPending
        ? rows.filter((r) => !r.status || r.status === 'NOT_SUBMITTED')
        : rows;

      return {
        content: {
          assignments: filtered.map((r) => ({
            title: r.title,
            subject: r.subjectCode,
            dueAt: r.dueAt?.toISOString() ?? null,
            status: r.status ?? 'NOT_SUBMITTED',
            score: r.score,
            outOf: r.maxScore,
          })),
        },
        citations: [{ type: 'assignments', label: 'Your assignments', href: '/student/assignments' }],
      };
    }

    if (user.facultyProfileId) {
      const rows = await db
        .select({
          title: t.assignments.title,
          dueAt: t.assignments.dueAt,
          subjectCode: t.subjects.code,
          sectionCode: t.sections.code,
          pending: sql<number>`count(*) filter (where ${t.submissions.status} in ('SUBMITTED','LATE','RESUBMITTED'))`,
          total: sql<number>`count(${t.submissions.id})`,
        })
        .from(t.assignments)
        .innerJoin(t.courseOfferings, eq(t.courseOfferings.id, t.assignments.offeringId))
        .innerJoin(t.subjects, eq(t.subjects.id, t.courseOfferings.subjectId))
        .innerJoin(t.sections, eq(t.sections.id, t.courseOfferings.sectionId))
        .leftJoin(t.submissions, eq(t.submissions.assignmentId, t.assignments.id))
        .where(
          and(
            eq(t.courseOfferings.facultyId, user.facultyProfileId),
            isNull(t.assignments.deletedAt),
          ),
        )
        .groupBy(t.assignments.id, t.subjects.code, t.sections.code);

      return {
        content: { assignments: rows },
        citations: [{ type: 'assignments', label: 'Your assignments', href: '/faculty/assignments' }],
      };
    }

    return { content: { assignments: [] } };
  },
};

const getRecentChanges: RegisteredTool = {
  name: 'get_recent_changes',
  description:
    'Return recent institutional changes that affect the caller — timetable moves, cancellations, deadline changes — with the reason and who approved each one.',
  inputSchema: {
    type: 'object',
    properties: { days: { type: 'number', description: 'How far back to look. Default 7.' } },
  },
  handler: async (input, { user }) => {
    const days = Math.min(60, Math.max(1, Number(input.days ?? 7)));
    const since = new Date(Date.now() - days * 86_400_000);

    const rows = await db
      .select({
        kind: t.changeEvents.kind,
        title: t.changeEvents.title,
        summary: t.changeEvents.summary,
        reason: t.changeEvents.reason,
        before: t.changeEvents.beforeValue,
        after: t.changeEvents.afterValue,
        affectedSectionIds: t.changeEvents.affectedSectionIds,
        createdAt: t.changeEvents.createdAt,
        changedByFirst: t.users.firstName,
        changedByLast: t.users.lastName,
      })
      .from(t.changeEvents)
      .leftJoin(t.users, eq(t.users.id, t.changeEvents.changedById))
      .where(
        and(
          eq(t.changeEvents.institutionId, user.institutionId),
          gte(t.changeEvents.createdAt, since),
        ),
      )
      .orderBy(desc(t.changeEvents.createdAt))
      .limit(30);

    // Students only see changes that touch their own section (or everyone).
    const relevant = user.sectionId
      ? rows.filter((r) => {
          const ids = (r.affectedSectionIds ?? []) as string[];
          return ids.length === 0 || ids.includes(user.sectionId!);
        })
      : rows;

    return {
      content: {
        changes: relevant.map((r) => ({
          kind: r.kind,
          title: r.title,
          change: r.summary,
          reason: r.reason,
          changedBy: r.changedByFirst ? `${r.changedByFirst} ${r.changedByLast ?? ''}`.trim() : 'System',
          when: r.createdAt.toISOString(),
        })),
      },
      citations: [{ type: 'change_feed', label: 'Campus change feed', href: `/${user.portal}/changes` }],
    };
  },
};

const findScheduleConflicts: RegisteredTool = {
  name: 'find_schedule_conflicts',
  description:
    'Scan the published timetable for room, faculty or section clashes and capacity problems. Returns the actual conflicting entries.',
  requiredPermission: 'timetable:view_all',
  inputSchema: { type: 'object', properties: {} },
  handler: async (_input, { user }) => {
    const { scanVersionConflicts } = await import('@/services/timetable/conflicts');

    const [version] = await db
      .select({ id: t.timetableVersions.id })
      .from(t.timetableVersions)
      .where(
        and(
          eq(t.timetableVersions.institutionId, user.institutionId),
          eq(t.timetableVersions.status, 'PUBLISHED'),
        ),
      )
      .limit(1);

    if (!version) {
      return { content: { total: 0, note: 'No timetable is currently published.' } };
    }

    const scan = await scanVersionConflicts(user.institutionId, version.id);
    return {
      content: { total: scan.total, conflicts: scan.items.slice(0, 20) },
      citations: [{ type: 'timetable', label: 'Published timetable', href: '/admin/timetable' }],
    };
  },
};

const getRoomUtilization: RegisteredTool = {
  name: 'get_room_utilization',
  description:
    'Return per-room utilisation across the published timetable, highlighting rooms that are under-used.',
  requiredPermission: 'room:view',
  inputSchema: { type: 'object', properties: {} },
  handler: async (_input, { user }) => {
    const { computeRoomUtilization } = await import('@/services/analytics');
    const data = await computeRoomUtilization(user.institutionId);
    return {
      content: data,
      citations: [{ type: 'analytics', label: 'Room utilisation', href: '/admin/analytics' }],
    };
  },
};

const analyzeWorkload: RegisteredTool = {
  name: 'analyze_workload',
  description:
    'Return faculty workload against contracted hours and the department average, flagging overload.',
  requiredPermission: 'workload:view_own',
  inputSchema: { type: 'object', properties: {} },
  handler: async (_input, { user }) => {
    const scopeToSelf = !user.permissions.has('workload:view_all') &&
      !user.permissions.has('workload:view_department');

    const rows = await db
      .select({
        facultyFirst: t.users.firstName,
        facultyLast: t.users.lastName,
        total: t.workloadSummaries.totalHours,
        teaching: t.workloadSummaries.teachingHours,
        lab: t.workloadSummaries.labHours,
        assessment: t.workloadSummaries.assessmentHours,
        admin: t.workloadSummaries.administrativeHours,
        deptAverage: t.workloadSummaries.departmentAverage,
        utilisation: t.workloadSummaries.utilizationPercentage,
        status: t.workloadSummaries.status,
      })
      .from(t.workloadSummaries)
      .innerJoin(t.facultyProfiles, eq(t.facultyProfiles.id, t.workloadSummaries.facultyId))
      .innerJoin(t.users, eq(t.users.id, t.facultyProfiles.userId))
      .where(
        and(
          eq(t.workloadSummaries.institutionId, user.institutionId),
          scopeToSelf && user.facultyProfileId
            ? eq(t.workloadSummaries.facultyId, user.facultyProfileId)
            : sql`true`,
        ),
      )
      .orderBy(desc(t.workloadSummaries.totalHours));

    return {
      content: {
        faculty: rows.map((r) => ({
          name: `${r.facultyFirst} ${r.facultyLast}`,
          totalHoursPerWeek: Number(r.total),
          breakdown: {
            teaching: Number(r.teaching),
            lab: Number(r.lab),
            assessment: Number(r.assessment),
            administrative: Number(r.admin),
          },
          departmentAverage: r.deptAverage ? Number(r.deptAverage) : null,
          utilisationPercent: r.utilisation ? Number(r.utilisation) : null,
          status: r.status,
        })),
      },
      citations: [{ type: 'workload', label: 'Workload records', href: `/${user.portal}/workload` }],
    };
  },
};

const getGrievances: RegisteredTool = {
  name: 'get_grievances',
  description:
    'Return redressal cases visible to the caller, with SLA status. Students see only their own cases.',
  requiredPermission: 'grievance:view_own',
  inputSchema: {
    type: 'object',
    properties: { onlyOpen: { type: 'boolean' } },
  },
  handler: async (input, { user }) => {
    const viewAll = user.permissions.has('grievance:view_all');
    const viewAssigned = user.permissions.has('grievance:view_assigned');

    const rows = await db
      .select({
        caseNumber: t.grievances.caseNumber,
        subject: t.grievances.subject,
        status: t.grievances.status,
        urgency: t.grievances.urgency,
        category: t.grievanceCategories.name,
        resolutionDueAt: t.grievances.resolutionDueAt,
        isSlaBreached: t.grievances.isSlaBreached,
        createdAt: t.grievances.createdAt,
      })
      .from(t.grievances)
      .innerJoin(t.grievanceCategories, eq(t.grievanceCategories.id, t.grievances.categoryId))
      .where(
        and(
          eq(t.grievances.institutionId, user.institutionId),
          viewAll
            ? sql`true`
            : viewAssigned
              ? eq(t.grievances.assignedToId, user.userId)
              : eq(t.grievances.raisedById, user.userId),
          input.onlyOpen
            ? inArray(t.grievances.status, [
                'SUBMITTED','ACKNOWLEDGED','ASSIGNED','UNDER_REVIEW','AWAITING_INFORMATION','REOPENED',
              ])
            : sql`true`,
        ),
      )
      .orderBy(t.grievances.resolutionDueAt)
      .limit(25);

    const now = Date.now();
    return {
      content: {
        cases: rows.map((r) => ({
          caseNumber: r.caseNumber,
          subject: r.subject,
          category: r.category,
          status: r.status,
          urgency: r.urgency,
          slaHoursRemaining: r.resolutionDueAt
            ? Math.round((r.resolutionDueAt.getTime() - now) / 3600_000)
            : null,
          slaBreached: r.isSlaBreached,
        })),
      },
      citations: [
        { type: 'grievance', label: 'Redressal centre', href: `/${user.portal}/redressal` },
      ],
    };
  },
};

const getSkillProfile: RegisteredTool = {
  name: 'get_skill_profile',
  description:
    'Return the calling student\'s evidenced skill profile and, if a career goal is set, the gap to that role.',
  requiredPermission: 'skill:view_own',
  inputSchema: { type: 'object', properties: {} },
  handler: async (_input, { user }) => {
    if (!user.studentProfileId) {
      return { content: { error: 'Skill profiles exist for student accounts only.' } };
    }
    const { getStudentSkillProfile } = await import('@/services/skills');
    const profile = await getStudentSkillProfile(user.institutionId, user.studentProfileId);
    return {
      content: profile,
      citations: [{ type: 'skills', label: 'Your skill profile', href: '/student/skills' }],
    };
  },
};

const searchResources: RegisteredTool = {
  name: 'search_resources',
  description:
    'Full-text search over the institution\'s academic resources. Returns only resources the caller may view. Never invents sources.',
  inputSchema: {
    type: 'object',
    properties: { query: { type: 'string', description: 'Search terms.' } },
    required: ['query'],
  },
  handler: async (input, { user }) => {
    const query = String(input.query ?? '').trim();
    if (!query) return { content: { results: [] } };

    const rows = await db
      .select({
        id: t.resources.id,
        title: t.resources.title,
        description: t.resources.description,
        kind: t.resources.kind,
        topic: t.resources.topic,
        subjectCode: t.subjects.code,
        isAiGenerated: t.resources.isAiGenerated,
        rank: sql<number>`ts_rank(${t.resources.searchVector}, plainto_tsquery('english', ${query}))`,
      })
      .from(t.resources)
      .leftJoin(t.subjects, eq(t.subjects.id, t.resources.subjectId))
      .where(
        and(
          eq(t.resources.institutionId, user.institutionId),
          eq(t.resources.status, 'PUBLISHED'),
          isNull(t.resources.deletedAt),
          sql`${t.resources.searchVector} @@ plainto_tsquery('english', ${query})`,
        ),
      )
      .orderBy(desc(sql`ts_rank(${t.resources.searchVector}, plainto_tsquery('english', ${query}))`))
      .limit(8);

    return {
      content: {
        query,
        resultCount: rows.length,
        results: rows.map((r) => ({
          title: r.title,
          description: r.description,
          type: r.kind,
          topic: r.topic,
          subject: r.subjectCode,
        })),
        note: rows.length === 0 ? 'No institutional resource matched. Nothing was invented.' : undefined,
      },
      citations: rows.map((r) => ({
        type: 'resource',
        id: r.id,
        label: r.title,
        href: `/${user.portal}/resources/${r.id}`,
      })),
    };
  },
};

const getAnnouncements: RegisteredTool = {
  name: 'get_announcements',
  description:
    'Return notices addressed to the caller, including whether an acknowledgement is still outstanding.',
  inputSchema: { type: 'object', properties: { unreadOnly: { type: 'boolean' } } },
  handler: async (input, { user }) => {
    const rows = await db
      .select({
        reference: t.announcements.reference,
        title: t.announcements.title,
        summary: t.announcements.summary,
        category: t.announcements.category,
        priority: t.announcements.priority,
        publishedAt: t.announcements.publishedAt,
        requiresAck: t.announcements.requiresAcknowledgement,
        readAt: t.announcementRecipients.readAt,
        acknowledgedAt: t.announcementRecipients.acknowledgedAt,
      })
      .from(t.announcementRecipients)
      .innerJoin(t.announcements, eq(t.announcements.id, t.announcementRecipients.announcementId))
      .where(
        and(
          eq(t.announcementRecipients.userId, user.userId),
          eq(t.announcements.status, 'PUBLISHED'),
          input.unreadOnly ? isNull(t.announcementRecipients.readAt) : sql`true`,
        ),
      )
      .orderBy(desc(t.announcements.publishedAt))
      .limit(15);

    return {
      content: {
        notices: rows.map((r) => ({
          reference: r.reference,
          title: r.title,
          summary: r.summary,
          category: r.category,
          priority: r.priority,
          read: !!r.readAt,
          acknowledgementOutstanding: r.requiresAck && !r.acknowledgedAt,
          publishedAt: r.publishedAt?.toISOString() ?? null,
        })),
      },
      citations: [
        { type: 'announcements', label: 'Announcements', href: `/${user.portal}/announcements` },
      ],
    };
  },
};

const getRoomAvailability: RegisteredTool = {
  name: 'get_room_availability',
  description: 'Find rooms that are free in a given day and period of the published timetable.',
  requiredPermission: 'room:view',
  inputSchema: {
    type: 'object',
    properties: {
      day: { type: 'string', description: 'MONDAY..SATURDAY' },
      position: { type: 'number', description: 'Period number within the day.' },
      minCapacity: { type: 'number' },
    },
  },
  handler: async (input, { user }) => {
    const day = resolveDay(input);
    const position = Number(input.position ?? 0);
    const minCapacity = Number(input.minCapacity ?? 0);

    const slots = await db
      .select()
      .from(t.timeSlots)
      .where(
        and(
          eq(t.timeSlots.institutionId, user.institutionId),
          eq(t.timeSlots.kind, 'TEACHING'),
          day ? eq(t.timeSlots.dayOfWeek, day as never) : sql`true`,
          position ? eq(t.timeSlots.position, position) : sql`true`,
        ),
      );

    if (slots.length === 0) return { content: { note: 'No matching teaching period found.', rooms: [] } };

    const slotIds = slots.map((sl) => sl.id);
    const busy = await db
      .select({ roomId: t.timetableEntries.roomId, slotId: t.timetableEntries.timeSlotId })
      .from(t.timetableEntries)
      .innerJoin(t.timetableVersions, eq(t.timetableVersions.id, t.timetableEntries.versionId))
      .where(
        and(
          eq(t.timetableVersions.status, 'PUBLISHED'),
          inArray(t.timetableEntries.timeSlotId, slotIds),
          eq(t.timetableEntries.isCancelled, false),
        ),
      );

    const busySet = new Set(busy.map((b) => `${b.roomId}:${b.slotId}`));
    const allRooms = await db
      .select()
      .from(t.rooms)
      .where(
        and(
          eq(t.rooms.institutionId, user.institutionId),
          eq(t.rooms.isBookable, true),
          isNull(t.rooms.deletedAt),
          minCapacity ? gte(t.rooms.capacity, minCapacity) : sql`true`,
        ),
      );

    const free = allRooms.filter((r) => slotIds.every((sid) => !busySet.has(`${r.id}:${sid}`)));

    return {
      content: {
        day: day ?? 'any',
        period: position || 'any',
        freeRooms: free.map((r) => ({ code: r.code, type: r.type, capacity: r.capacity })),
      },
      citations: [{ type: 'rooms', label: 'Room register', href: '/admin/rooms' }],
    };
  },
};

const getAtRiskStudents: RegisteredTool = {
  name: 'get_at_risk_students',
  description:
    'Return students below the attendance requirement, so staff can intervene. Faculty see only their own sections.',
  requiredPermission: 'attendance:view_section',
  inputSchema: { type: 'object', properties: { limit: { type: 'number' } } },
  handler: async (input, { user }) => {
    const limit = Math.min(50, Math.max(1, Number(input.limit ?? 20)));

    const rows = await db
      .select({
        rollNumber: t.studentProfiles.rollNumber,
        firstName: t.users.firstName,
        lastName: t.users.lastName,
        sectionCode: t.sections.code,
        subjectCode: t.subjects.code,
        percentageBp: t.attendanceSummaries.percentageBp,
        attended: t.attendanceSummaries.attendedSessions,
        held: t.attendanceSummaries.heldSessions,
      })
      .from(t.attendanceSummaries)
      .innerJoin(t.studentProfiles, eq(t.studentProfiles.id, t.attendanceSummaries.studentId))
      .innerJoin(t.users, eq(t.users.id, t.studentProfiles.userId))
      .innerJoin(t.courseOfferings, eq(t.courseOfferings.id, t.attendanceSummaries.offeringId))
      .innerJoin(t.subjects, eq(t.subjects.id, t.courseOfferings.subjectId))
      .innerJoin(t.sections, eq(t.sections.id, t.courseOfferings.sectionId))
      .where(
        and(
          eq(t.attendanceSummaries.institutionId, user.institutionId),
          eq(t.attendanceSummaries.isBelowThreshold, true),
          user.facultyProfileId && !user.permissions.has('attendance:view_all')
            ? eq(t.courseOfferings.facultyId, user.facultyProfileId)
            : sql`true`,
        ),
      )
      .orderBy(t.attendanceSummaries.percentageBp)
      .limit(limit);

    return {
      content: {
        count: rows.length,
        students: rows.map((r) => ({
          rollNumber: r.rollNumber,
          name: `${r.firstName} ${r.lastName}`,
          section: r.sectionCode,
          subject: r.subjectCode,
          attendance: r.percentageBp / 100,
          attended: r.attended,
          held: r.held,
        })),
      },
      citations: [{ type: 'attendance', label: 'Attendance analytics', href: '/admin/analytics' }],
    };
  },
};

/* ------------------------- proposals (confirm first) ---------------------- */

function proposalTool(op: ActionOperation, name: string, description: string, properties: Record<string, unknown>, required: string[]): RegisteredTool {
  return {
    name,
    description: `${description} This does NOT change anything by itself: it shows the person a confirmation card, and nothing happens unless they press Confirm. Never say it is done.`,
    mutating: true,
    inputSchema: { type: 'object', properties, required },
    available: (user) => actionAvailable(user, op),
    handler: async (input, { user, conversationId }) => {
      const p = await proposeAction(user, op, input, conversationId ?? null);
      return {
        content: p.ok
          ? { proposal: { id: p.id, summary: p.summary }, note: 'Waiting for the person to confirm. Nothing has changed yet.' }
          : { proposalRefused: { summary: p.summary, reason: p.notes } },
      };
    },
  };
}

const proposeTask = proposalTool(
  'create_task',
  'propose_task',
  'Suggest adding a to-do to the person’s own tracker.',
  { title: { type: 'string', description: 'The task, e.g. "Email the placement cell"' }, dueDate: { type: 'string', description: 'Optional YYYY-MM-DD' } },
  ['title'],
);
const proposeGoalCheckin = proposalTool(
  'goal_checkin',
  'propose_goal_checkin',
  'Suggest logging today’s check-in for one of the person’s own habits, matched by name.',
  { goal: { type: 'string', description: 'Part of the habit’s name, e.g. "reading"' } },
  ['goal'],
);
const proposeLibraryRenewal = proposalTool(
  'renew_library_loan',
  'propose_library_renewal',
  'Suggest renewing one of the person’s own borrowed library books, matched by title.',
  { book: { type: 'string', description: 'Part of the book title' } },
  ['book'],
);

/* ------------------------------- registry --------------------------------- */

const ALL_TOOLS: RegisteredTool[] = [
  getSchedule,
  getAttendance,
  getAssignments,
  getRecentChanges,
  findScheduleConflicts,
  getRoomUtilization,
  analyzeWorkload,
  getGrievances,
  getSkillProfile,
  searchResources,
  getAnnouncements,
  getRoomAvailability,
  getAtRiskStudents,
  proposeTask,
  proposeGoalCheckin,
  proposeLibraryRenewal,
];

/** Tools this specific caller is allowed to use. */
export function toolsForUser(user: AuthContext): AiTool[] {
  return ALL_TOOLS.filter(
    (tool) => (!tool.requiredPermission || user.permissions.has(tool.requiredPermission as never)) && (!tool.available || tool.available(user)),
  ).map(({ handler: _handler, available: _available, ...rest }) => rest);
}

/**
 * Executes a tool call. Re-checks permission at execution time — the list the
 * model saw is not treated as authorisation.
 */
export async function executeTool(
  name: string,
  input: Record<string, unknown>,
  ctx: ToolContext,
  toolCallId = 'direct',
): Promise<ToolResult> {
  const tool = ALL_TOOLS.find((x) => x.name === name);

  if (!tool) {
    return {
      toolCallId,
      name,
      content: { error: `Unknown tool "${name}".` },
      isError: true,
    };
  }

  if ((tool.requiredPermission && !ctx.user.permissions.has(tool.requiredPermission as never)) || (tool.available && !tool.available(ctx.user))) {
    return {
      toolCallId,
      name,
      content: { error: 'You do not have permission to access that information.' },
      isError: true,
    };
  }

  try {
    const { content, citations } = await tool.handler(input, ctx);
    return { toolCallId, name, content, citations };
  } catch (error) {
    console.error(`[campusos:ai] tool ${name} failed`, error);
    return {
      toolCallId,
      name,
      content: { error: 'That lookup could not be completed.' },
      isError: true,
    };
  }
}
