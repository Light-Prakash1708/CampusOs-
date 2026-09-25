import 'server-only';
import { and, eq, sql, desc, count, gte, inArray, isNull } from 'drizzle-orm';
import { db } from '@/lib/db';
import * as t from '@/lib/db/schema';

/**
 * ANALYTICS
 * ---------------------------------------------------------------------------
 * Every number here is computed from records, and each function documents what
 * it counts. Nothing is decorative: if a metric cannot be derived honestly, it
 * is not shown.
 */

export interface RoomUtilization {
  totalTeachingSlots: number;
  rooms: {
    id: string;
    code: string;
    type: string;
    capacity: number;
    occupiedSlots: number;
    utilizationPercent: number;
    /** Average seats left empty when the room is in use. */
    averageSpareSeats: number;
  }[];
  overallUtilizationPercent: number;
  underusedRooms: { code: string; utilizationPercent: number }[];
  /** Concrete consolidation opportunity, or null when there isn't one. */
  consolidationHint: string | null;
}

export async function computeRoomUtilization(institutionId: string): Promise<RoomUtilization> {
  const [teachingSlots] = await db
    .select({ value: count() })
    .from(t.timeSlots)
    .where(and(eq(t.timeSlots.institutionId, institutionId), eq(t.timeSlots.kind, 'TEACHING')));

  const totalTeachingSlots = teachingSlots?.value ?? 0;

  const rows = await db
    .select({
      id: t.rooms.id,
      code: t.rooms.code,
      type: t.rooms.type,
      capacity: t.rooms.capacity,
      occupiedSlots: sql<number>`count(${t.timetableEntries.id})`,
      avgStrength: sql<number>`coalesce(avg(${t.sections.strength}), 0)`,
    })
    .from(t.rooms)
    .leftJoin(
      t.timetableEntries,
      and(
        eq(t.timetableEntries.roomId, t.rooms.id),
        eq(t.timetableEntries.isCancelled, false),
      ),
    )
    .leftJoin(
      t.timetableVersions,
      and(
        eq(t.timetableVersions.id, t.timetableEntries.versionId),
        eq(t.timetableVersions.status, 'PUBLISHED'),
      ),
    )
    .leftJoin(t.sections, eq(t.sections.id, t.timetableEntries.sectionId))
    .where(
      and(
        eq(t.rooms.institutionId, institutionId),
        eq(t.rooms.isBookable, true),
        isNull(t.rooms.deletedAt),
      ),
    )
    .groupBy(t.rooms.id, t.rooms.code, t.rooms.type, t.rooms.capacity)
    .orderBy(t.rooms.code);

  const rooms = rows.map((r) => {
    const occupied = Number(r.occupiedSlots);
    const utilization = totalTeachingSlots ? (occupied / totalTeachingSlots) * 100 : 0;
    return {
      id: r.id,
      code: r.code,
      type: r.type,
      capacity: r.capacity,
      occupiedSlots: occupied,
      utilizationPercent: Math.round(utilization * 10) / 10,
      averageSpareSeats: Math.max(0, Math.round(r.capacity - Number(r.avgStrength))),
    };
  });

  const totalOccupied = rooms.reduce((n, r) => n + r.occupiedSlots, 0);
  const capacitySlots = rooms.length * totalTeachingSlots;
  const underused = rooms
    .filter((r) => r.utilizationPercent < 40 && r.type !== 'AUDITORIUM')
    .map((r) => ({ code: r.code, utilizationPercent: r.utilizationPercent }));

  let consolidationHint: string | null = null;
  if (underused.length >= 2) {
    // Name the emptiest few rather than listing everything.
    const emptiest = [...underused]
      .sort((a, b) => a.utilizationPercent - b.utilizationPercent)
      .slice(0, 3)
      .map((r) => r.code);
    const names =
      emptiest.length > 1
        ? `${emptiest.slice(0, -1).join(', ')} and ${emptiest[emptiest.length - 1]}`
        : emptiest[0];
    consolidationHint = `${underused.length} rooms are below 40% utilisation — ${names} are the emptiest. Consolidating their classes into better-used rooms would free space for labs, remedial sessions or events.`;
  }

  return {
    totalTeachingSlots,
    rooms,
    overallUtilizationPercent: capacitySlots
      ? Math.round((totalOccupied / capacitySlots) * 1000) / 10
      : 0,
    underusedRooms: underused,
    consolidationHint,
  };
}

export interface WorkloadBalance {
  faculty: {
    id: string;
    name: string;
    department: string;
    totalHours: number;
    contractedMax: number;
    utilizationPercent: number;
    status: string;
    departmentAverage: number | null;
  }[];
  departmentAverages: { department: string; average: number; facultyCount: number }[];
  overloadedCount: number;
  underloadedCount: number;
  /** Standard deviation of weekly hours — the headline "balance" number. */
  spread: number;
  rebalanceHint: string | null;
}

export async function computeWorkloadBalance(institutionId: string): Promise<WorkloadBalance> {
  const rows = await db
    .select({
      id: t.facultyProfiles.id,
      firstName: t.users.firstName,
      lastName: t.users.lastName,
      department: t.departments.code,
      totalHours: t.workloadSummaries.totalHours,
      contractedMax: t.facultyProfiles.maxWeeklyTeachingHours,
      utilization: t.workloadSummaries.utilizationPercentage,
      status: t.workloadSummaries.status,
      deptAverage: t.workloadSummaries.departmentAverage,
    })
    .from(t.workloadSummaries)
    .innerJoin(t.facultyProfiles, eq(t.facultyProfiles.id, t.workloadSummaries.facultyId))
    .innerJoin(t.users, eq(t.users.id, t.facultyProfiles.userId))
    .innerJoin(t.departments, eq(t.departments.id, t.facultyProfiles.departmentId))
    .where(eq(t.workloadSummaries.institutionId, institutionId))
    .orderBy(desc(t.workloadSummaries.totalHours));

  const faculty = rows.map((r) => ({
    id: r.id,
    name: `${r.firstName} ${r.lastName}`,
    department: r.department,
    totalHours: Number(r.totalHours),
    contractedMax: r.contractedMax,
    utilizationPercent: r.utilization ? Number(r.utilization) : 0,
    status: r.status,
    departmentAverage: r.deptAverage ? Number(r.deptAverage) : null,
  }));

  const byDept = new Map<string, number[]>();
  for (const f of faculty) {
    const list = byDept.get(f.department) ?? [];
    list.push(f.totalHours);
    byDept.set(f.department, list);
  }

  const departmentAverages = [...byDept.entries()].map(([department, hours]) => ({
    department,
    average: Math.round((hours.reduce((a, b) => a + b, 0) / hours.length) * 10) / 10,
    facultyCount: hours.length,
  }));

  const hours = faculty.map((f) => f.totalHours);
  const mean = hours.length ? hours.reduce((a, b) => a + b, 0) / hours.length : 0;
  const variance = hours.length
    ? hours.reduce((a, b) => a + (b - mean) ** 2, 0) / hours.length
    : 0;

  const overloaded = faculty.filter((f) => f.status === 'HIGH' || f.status === 'CRITICAL');
  const underloaded = faculty.filter((f) => f.status === 'UNDERLOADED');

  let rebalanceHint: string | null = null;
  if (overloaded.length > 0 && underloaded.length > 0) {
    const from = overloaded[0]!;
    const to = underloaded[0]!;
    if (from.department === to.department) {
      rebalanceHint = `${from.name} is at ${from.totalHours} hrs/week against a ${from.contractedMax} hr contract, while ${to.name} in the same department is at ${to.totalHours}. Moving one section between them would bring both within contract.`;
    } else {
      rebalanceHint = `${overloaded.length} faculty are above their contracted load and ${underloaded.length} are well below. A departmental review would even this out.`;
    }
  }

  return {
    faculty,
    departmentAverages,
    overloadedCount: overloaded.length,
    underloadedCount: underloaded.length,
    spread: Math.round(Math.sqrt(variance) * 10) / 10,
    rebalanceHint,
  };
}

export interface CommunicationHealth {
  publishedLast30Days: number;
  averageReadRate: number;
  averageAcknowledgementRate: number;
  outstandingAcknowledgements: number;
  noticesRequiringAck: number;
  worstPerforming: { reference: string; title: string; readRate: number; pending: number }[];
}

export async function computeCommunicationHealth(
  institutionId: string,
): Promise<CommunicationHealth> {
  const since = new Date(Date.now() - 30 * 86_400_000);

  const rows = await db
    .select({
      reference: t.announcements.reference,
      title: t.announcements.title,
      recipientCount: t.announcements.recipientCount,
      readCount: t.announcements.readCount,
      acknowledgedCount: t.announcements.acknowledgedCount,
      requiresAck: t.announcements.requiresAcknowledgement,
    })
    .from(t.announcements)
    .where(
      and(
        eq(t.announcements.institutionId, institutionId),
        eq(t.announcements.status, 'PUBLISHED'),
        gte(t.announcements.publishedAt, since),
      ),
    );

  const withRecipients = rows.filter((r) => r.recipientCount > 0);
  const readRates = withRecipients.map((r) => (r.readCount / r.recipientCount) * 100);
  const ackNotices = withRecipients.filter((r) => r.requiresAck);
  const ackRates = ackNotices.map((r) => (r.acknowledgedCount / r.recipientCount) * 100);

  const outstanding = ackNotices.reduce(
    (n, r) => n + (r.recipientCount - r.acknowledgedCount),
    0,
  );

  const worst = withRecipients
    .map((r) => ({
      reference: r.reference,
      title: r.title,
      readRate: Math.round((r.readCount / r.recipientCount) * 1000) / 10,
      pending: r.recipientCount - (r.requiresAck ? r.acknowledgedCount : r.readCount),
    }))
    .sort((a, b) => a.readRate - b.readRate)
    .slice(0, 5);

  const avg = (xs: number[]) =>
    xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : 0;

  return {
    publishedLast30Days: rows.length,
    averageReadRate: avg(readRates),
    averageAcknowledgementRate: avg(ackRates),
    outstandingAcknowledgements: outstanding,
    noticesRequiringAck: ackNotices.length,
    worstPerforming: worst,
  };
}

export interface GrievanceHealth {
  open: number;
  breached: number;
  approachingSla: number;
  resolvedLast30Days: number;
  averageResolutionHours: number | null;
  byCategory: { category: string; open: number; breached: number }[];
}

export async function computeGrievanceHealth(institutionId: string): Promise<GrievanceHealth> {
  const OPEN_STATES = [
    'SUBMITTED','ACKNOWLEDGED','ASSIGNED','UNDER_REVIEW','AWAITING_INFORMATION','REOPENED',
  ] as const;

  const rows = await db
    .select({
      status: t.grievances.status,
      isSlaBreached: t.grievances.isSlaBreached,
      resolutionDueAt: t.grievances.resolutionDueAt,
      resolvedAt: t.grievances.resolvedAt,
      createdAt: t.grievances.createdAt,
      category: t.grievanceCategories.name,
    })
    .from(t.grievances)
    .innerJoin(t.grievanceCategories, eq(t.grievanceCategories.id, t.grievances.categoryId))
    .where(eq(t.grievances.institutionId, institutionId));

  const now = Date.now();
  const open = rows.filter((r) => OPEN_STATES.includes(r.status as never));
  const breached = open.filter((r) => r.isSlaBreached);
  const approaching = open.filter(
    (r) =>
      !r.isSlaBreached &&
      r.resolutionDueAt &&
      r.resolutionDueAt.getTime() - now < 24 * 3600_000 &&
      r.resolutionDueAt.getTime() > now,
  );

  const since = now - 30 * 86_400_000;
  const resolved = rows.filter((r) => r.resolvedAt && r.resolvedAt.getTime() > since);
  const durations = resolved
    .filter((r) => r.resolvedAt)
    .map((r) => (r.resolvedAt!.getTime() - r.createdAt.getTime()) / 3600_000);

  const byCategoryMap = new Map<string, { open: number; breached: number }>();
  for (const r of open) {
    const entry = byCategoryMap.get(r.category) ?? { open: 0, breached: 0 };
    entry.open += 1;
    if (r.isSlaBreached) entry.breached += 1;
    byCategoryMap.set(r.category, entry);
  }

  return {
    open: open.length,
    breached: breached.length,
    approachingSla: approaching.length,
    resolvedLast30Days: resolved.length,
    averageResolutionHours: durations.length
      ? Math.round((durations.reduce((a, b) => a + b, 0) / durations.length) * 10) / 10
      : null,
    byCategory: [...byCategoryMap.entries()].map(([category, v]) => ({ category, ...v })),
  };
}

export interface AttendanceHealth {
  overallPercent: number;
  studentsBelowThreshold: number;
  totalTrackedStudents: number;
  worstSubjects: { subject: string; percent: number; belowCount: number }[];
}

export async function computeAttendanceHealth(institutionId: string): Promise<AttendanceHealth> {
  const rows = await db
    .select({
      studentId: t.attendanceSummaries.studentId,
      held: t.attendanceSummaries.heldSessions,
      attended: t.attendanceSummaries.attendedSessions,
      below: t.attendanceSummaries.isBelowThreshold,
      subjectCode: t.subjects.code,
      subjectName: t.subjects.name,
    })
    .from(t.attendanceSummaries)
    .innerJoin(t.courseOfferings, eq(t.courseOfferings.id, t.attendanceSummaries.offeringId))
    .innerJoin(t.subjects, eq(t.subjects.id, t.courseOfferings.subjectId))
    .where(eq(t.attendanceSummaries.institutionId, institutionId));

  const totalHeld = rows.reduce((n, r) => n + r.held, 0);
  const totalAttended = rows.reduce((n, r) => n + r.attended, 0);

  const studentsBelow = new Set(rows.filter((r) => r.below).map((r) => r.studentId));
  const allStudents = new Set(rows.map((r) => r.studentId));

  const bySubject = new Map<string, { held: number; attended: number; below: number }>();
  for (const r of rows) {
    const key = `${r.subjectCode} ${r.subjectName}`;
    const entry = bySubject.get(key) ?? { held: 0, attended: 0, below: 0 };
    entry.held += r.held;
    entry.attended += r.attended;
    if (r.below) entry.below += 1;
    bySubject.set(key, entry);
  }

  const worst = [...bySubject.entries()]
    .map(([subject, v]) => ({
      subject,
      percent: v.held ? Math.round((v.attended / v.held) * 1000) / 10 : 0,
      belowCount: v.below,
    }))
    .sort((a, b) => a.percent - b.percent)
    .slice(0, 5);

  return {
    overallPercent: totalHeld ? Math.round((totalAttended / totalHeld) * 1000) / 10 : 0,
    studentsBelowThreshold: studentsBelow.size,
    totalTrackedStudents: allStudents.size,
    worstSubjects: worst,
  };
}

/**
 * Composite "campus productivity" index.
 *
 * IMPORTANT: this is an internal product metric, not an official institutional
 * standard. The UI states that explicitly, and each dimension is shown so the
 * number can be interrogated rather than taken on faith.
 */
export interface ProductivityScore {
  score: number;
  dimensions: { label: string; score: number; weight: number; basis: string }[];
  disclaimer: string;
}

export async function computeProductivityScore(
  institutionId: string,
): Promise<ProductivityScore> {
  const [comms, grievance, rooms, workload] = await Promise.all([
    computeCommunicationHealth(institutionId),
    computeGrievanceHealth(institutionId),
    computeRoomUtilization(institutionId),
    computeWorkloadBalance(institutionId),
  ]);

  // Schedule stability: fewer disruptive changes in 30 days is better.
  const since = new Date(Date.now() - 30 * 86_400_000);
  const [changes] = await db
    .select({ value: count() })
    .from(t.changeEvents)
    .where(
      and(
        eq(t.changeEvents.institutionId, institutionId),
        gte(t.changeEvents.createdAt, since),
        inArray(t.changeEvents.kind, ['TIMETABLE_CHANGED', 'ROOM_CHANGED', 'CLASS_CANCELLED']),
      ),
    );

  const changeCount = changes?.value ?? 0;

  const dimensions = [
    {
      label: 'Communication reach',
      score: Math.round(comms.averageReadRate),
      weight: 0.25,
      basis: `${comms.publishedLast30Days} notices in 30 days, ${comms.averageReadRate}% average read rate`,
    },
    {
      label: 'Schedule stability',
      score: Math.max(0, 100 - changeCount * 6),
      weight: 0.2,
      basis: `${changeCount} disruptive schedule changes in 30 days`,
    },
    {
      label: 'Room utilisation',
      score: Math.min(100, Math.round(rooms.overallUtilizationPercent * 1.6)),
      weight: 0.2,
      basis: `${rooms.overallUtilizationPercent}% of room-periods in use`,
    },
    {
      label: 'Workload balance',
      score: Math.max(0, Math.round(100 - workload.spread * 8)),
      weight: 0.2,
      basis: `Standard deviation of ${workload.spread} hrs/week across faculty`,
    },
    {
      label: 'Case resolution',
      score:
        grievance.open === 0
          ? 100
          : Math.max(0, Math.round(100 - (grievance.breached / Math.max(1, grievance.open)) * 100)),
      weight: 0.15,
      basis: `${grievance.breached} of ${grievance.open} open cases past SLA`,
    },
  ];

  const score = Math.round(
    dimensions.reduce((sum, d) => sum + d.score * d.weight, 0),
  );

  return {
    score,
    dimensions,
    disclaimer:
      'Campus Productivity is an internal CampusOS product metric, not an accreditation or regulatory standard. Each dimension is shown so you can judge it yourself.',
  };
}

export interface TimeSavedSummary {
  totalMinutes: number;
  byActivity: { activity: string; minutes: number; occurrences: number }[];
  disclaimer: string;
}

export async function computeTimeSaved(institutionId: string): Promise<TimeSavedSummary> {
  const rows = await db
    .select({
      activity: t.timeSavedEvents.activity,
      minutes: sql<number>`sum(${t.timeSavedEvents.savedMinutes})`,
      occurrences: count(),
    })
    .from(t.timeSavedEvents)
    .where(eq(t.timeSavedEvents.institutionId, institutionId))
    .groupBy(t.timeSavedEvents.activity);

  const byActivity = rows.map((r) => ({
    activity: r.activity,
    minutes: Number(r.minutes),
    occurrences: Number(r.occurrences),
  }));

  return {
    totalMinutes: byActivity.reduce((n, r) => n + r.minutes, 0),
    byActivity,
    disclaimer:
      'Estimated using the institution’s configured manual-effort baselines. These are estimates, not measured timings, and can be recalibrated in Settings.',
  };
}
