import 'server-only';
import { and, eq, isNull, inArray, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  timeSlots,
  rooms,
  sections,
  subjects,
  courseOfferings,
  facultyProfiles,
  users,
  timetableVersions,
  timetableEntries,
  changeEvents,
} from '@/lib/db/schema';
import { defaultSolver } from './solver';
import type {
  SolverConstraint,
  SolverInput,
  SolverResult,
  SolverSession,
} from './types';
import { recordAudit } from '@/services/audit';
import type { AuthContext } from '@/lib/auth/context';
import { AppError } from '@/lib/api';

/**
 * Bridges the database and the pure solver.
 *
 *   loadSolverInput  : DB → solver input
 *   generateTimetable: runs the solver and persists the result as a PROPOSED
 *                      version (never touching the published one)
 *   publishTimetable : promotes a version, computes the diff against the
 *                      previously published one, and records change events
 *
 * Generation NEVER overwrites a published timetable. Publishing is a separate,
 * approved step, which is what makes the whole thing safe to run on live data.
 */

export async function loadSolverInput(
  institutionId: string,
  termId: string,
  extraConstraints: SolverConstraint[] = [],
): Promise<SolverInput> {
  const [slotRows, roomRows, sectionRows, offeringRows] = await Promise.all([
    db
      .select()
      .from(timeSlots)
      .where(eq(timeSlots.institutionId, institutionId))
      .orderBy(timeSlots.dayOfWeek, timeSlots.position),
    db
      .select()
      .from(rooms)
      .where(
        and(
          eq(rooms.institutionId, institutionId),
          eq(rooms.isBookable, true),
          isNull(rooms.deletedAt),
        ),
      ),
    db
      .select()
      .from(sections)
      .where(and(eq(sections.institutionId, institutionId), isNull(sections.deletedAt))),
    db
      .select({
        offeringId: courseOfferings.id,
        subjectId: subjects.id,
        subjectCode: subjects.code,
        subjectName: subjects.name,
        weeklyHours: subjects.weeklyHours,
        weeklyHoursOverride: courseOfferings.weeklyHoursOverride,
        consecutiveBlockSize: subjects.consecutiveBlockSize,
        requiredRoomType: subjects.requiredRoomType,
        sectionId: courseOfferings.sectionId,
        facultyId: courseOfferings.facultyId,
      })
      .from(courseOfferings)
      .innerJoin(subjects, eq(subjects.id, courseOfferings.subjectId))
      .where(
        and(
          eq(courseOfferings.institutionId, institutionId),
          eq(courseOfferings.termId, termId),
          eq(courseOfferings.isActive, true),
          isNull(courseOfferings.deletedAt),
        ),
      ),
  ]);

  const facultyRows = await db
    .select({
      id: facultyProfiles.id,
      firstName: users.firstName,
      lastName: users.lastName,
      maxWeeklyHours: facultyProfiles.maxWeeklyTeachingHours,
      availability: facultyProfiles.availability,
    })
    .from(facultyProfiles)
    .innerJoin(users, eq(users.id, facultyProfiles.userId))
    .where(
      and(eq(facultyProfiles.institutionId, institutionId), isNull(facultyProfiles.deletedAt)),
    );

  const assignableSlots = slotRows.filter((s) => s.kind === 'TEACHING');

  // Convert availability windows into explicit unavailable slot ids: the solver
  // works with a concrete blocked list rather than re-deriving time maths.
  const facultyInput = facultyRows.map((f) => {
    const windows = (f.availability ?? []) as { day: string; from: string; to: string }[];
    const unavailable: string[] = [];

    if (windows.length > 0) {
      for (const slot of assignableSlots) {
        const dayWindows = windows.filter((w) => w.day === slot.dayOfWeek);
        if (dayWindows.length === 0) {
          unavailable.push(slot.id);
          continue;
        }
        const withinAny = dayWindows.some(
          (w) => slot.startTime.slice(0, 5) >= w.from && slot.endTime.slice(0, 5) <= w.to,
        );
        if (!withinAny) unavailable.push(slot.id);
      }
    }

    return {
      id: f.id,
      name: `${f.firstName} ${f.lastName}`.trim(),
      unavailableSlotIds: unavailable,
      maxWeeklyHours: f.maxWeeklyHours,
      maxDailyHours: 4,
    };
  });

  // Expand offerings into individual placeable sessions.
  const sessions: SolverSession[] = [];
  for (const offering of offeringRows) {
    const totalHours = offering.weeklyHoursOverride ?? offering.weeklyHours;
    const block = Math.max(1, offering.consecutiveBlockSize);
    const sessionCount = Math.max(1, Math.floor(totalHours / block));

    for (let i = 0; i < sessionCount; i += 1) {
      sessions.push({
        id: `${offering.offeringId}::${i}`,
        offeringId: offering.offeringId,
        subjectId: offering.subjectId,
        subjectCode: offering.subjectCode,
        subjectName: offering.subjectName,
        sectionId: offering.sectionId,
        facultyId: offering.facultyId,
        length: block,
        requiredRoomType: offering.requiredRoomType,
        spreadKey: offering.offeringId,
      });
    }
  }

  return {
    slots: slotRows.map((s) => ({
      id: s.id,
      day: s.dayOfWeek,
      position: s.position,
      startTime: s.startTime,
      endTime: s.endTime,
      assignable: s.kind === 'TEACHING',
    })),
    rooms: roomRows.map((r) => ({
      id: r.id,
      code: r.code,
      type: r.type,
      capacity: r.capacity,
    })),
    faculty: facultyInput,
    sections: sectionRows.map((s) => ({
      id: s.id,
      code: s.code,
      strength: s.strength,
      homeRoomId: s.homeRoomId,
      maxDailyHours: 6,
    })),
    sessions,
    constraints: extraConstraints,
  };
}

export interface GenerateResult {
  versionId: string;
  result: SolverResult;
}

/** Runs the solver and stores the outcome as a new PROPOSED version. */
export async function generateTimetable(
  user: AuthContext,
  params: {
    termId: string;
    name?: string;
    constraints?: SolverConstraint[];
    timeLimitMs?: number;
    seed?: number;
  },
): Promise<GenerateResult> {
  const input = await loadSolverInput(
    user.institutionId,
    params.termId,
    params.constraints ?? [],
  );

  if (input.sessions.length === 0) {
    throw new AppError(
      'There are no course offerings to schedule for this term.',
      400,
      'NO_OFFERINGS',
      undefined,
      'Add subjects and assign them to sections first, then run the optimiser.',
    );
  }

  input.options = {
    timeLimitMs: params.timeLimitMs ?? 12_000,
    seed: params.seed ?? 20260820,
    refinementIterations: 8000,
  };

  const result = await defaultSolver.solve(input);

  const [{ maxVersion }] = await db
    .select({ maxVersion: sql<number>`coalesce(max(${timetableVersions.versionNumber}), 0)` })
    .from(timetableVersions)
    .where(eq(timetableVersions.termId, params.termId));

  const versionId = await db.transaction(async (tx) => {
    const [version] = await tx
      .insert(timetableVersions)
      .values({
        institutionId: user.institutionId,
        termId: params.termId,
        name: params.name ?? `Optimiser run ${Number(maxVersion) + 1}`,
        status: 'PROPOSED',
        versionNumber: Number(maxVersion) + 1,
        generatedBy: defaultSolver.name,
        createdById: user.userId,
        solverReport: result.report as unknown as Record<string, unknown>,
      })
      .returning({ id: timetableVersions.id });

    if (!version) throw new Error('Failed to create timetable version');

    const slotDayById = new Map(
      input.slots.map((s) => [s.id, s.day]),
    );

    // One row per occupied period: a 3-period lab becomes three entries so the
    // unique indexes catch any overlap the solver might have missed.
    const rows = result.placements.flatMap((p) =>
      p.slotIds.map((slotId) => ({
        institutionId: user.institutionId,
        versionId: version.id,
        offeringId: p.offeringId,
        timeSlotId: slotId,
        roomId: p.roomId,
        facultyId: p.facultyId,
        sectionId: p.sectionId,
        dayOfWeek: slotDayById.get(slotId) ?? p.day,
      })),
    );

    if (rows.length > 0) {
      // Chunked to stay well within parameter limits on large institutions.
      for (let i = 0; i < rows.length; i += 500) {
        await tx.insert(timetableEntries).values(rows.slice(i, i + 500));
      }
    }

    return version.id;
  });

  await recordAudit(user, {
    action: 'TIMETABLE_GENERATED',
    entityType: 'timetable_version',
    entityId: versionId,
    after: {
      placed: result.report.placedCount,
      unplaced: result.report.unplacedCount,
      qualityScore: result.report.qualityScore,
      solver: defaultSolver.name,
    },
    reason: 'Automatic generation',
  });

  return { versionId, result };
}

export interface PublishDiff {
  added: number;
  removed: number;
  moved: {
    subjectCode: string;
    sectionCode: string;
    before: string;
    after: string;
  }[];
}

/**
 * Publishes a version. Computes a human-readable diff against the currently
 * published timetable and writes change events so affected people can be told
 * exactly what moved and why.
 */
export async function publishTimetable(
  user: AuthContext,
  params: { versionId: string; reason: string },
): Promise<PublishDiff> {
  const [version] = await db
    .select()
    .from(timetableVersions)
    .where(
      and(
        eq(timetableVersions.id, params.versionId),
        eq(timetableVersions.institutionId, user.institutionId),
      ),
    )
    .limit(1);

  if (!version) throw new AppError('That timetable version does not exist.', 404, 'NOT_FOUND');
  if (version.status === 'PUBLISHED') {
    throw new AppError('This version is already published.', 409, 'ALREADY_PUBLISHED');
  }

  const [current] = await db
    .select()
    .from(timetableVersions)
    .where(
      and(
        eq(timetableVersions.termId, version.termId),
        eq(timetableVersions.status, 'PUBLISHED'),
      ),
    )
    .limit(1);

  const describe = async (versionId: string) => {
    const rows = await db
      .select({
        offeringId: timetableEntries.offeringId,
        subjectCode: subjects.code,
        sectionCode: sections.code,
        sectionId: timetableEntries.sectionId,
        slotLabel: timeSlots.label,
        day: timeSlots.dayOfWeek,
        start: timeSlots.startTime,
        roomCode: rooms.code,
      })
      .from(timetableEntries)
      .innerJoin(courseOfferings, eq(courseOfferings.id, timetableEntries.offeringId))
      .innerJoin(subjects, eq(subjects.id, courseOfferings.subjectId))
      .innerJoin(sections, eq(sections.id, timetableEntries.sectionId))
      .innerJoin(timeSlots, eq(timeSlots.id, timetableEntries.timeSlotId))
      .leftJoin(rooms, eq(rooms.id, timetableEntries.roomId))
      .where(eq(timetableEntries.versionId, versionId));

    return new Map(
      rows.map((r) => [
        `${r.offeringId}`,
        {
          ...r,
          label: `${r.day.charAt(0)}${r.day.slice(1).toLowerCase()} ${r.start.slice(0, 5)} · Room ${r.roomCode ?? 'TBD'}`,
        },
      ]),
    );
  };

  const nextMap = await describe(params.versionId);
  const prevMap = current ? await describe(current.id) : new Map();

  const moved: PublishDiff['moved'] = [];
  const affectedSectionIds = new Set<string>();

  for (const [offeringId, next] of nextMap) {
    const prev = prevMap.get(offeringId);
    if (prev && prev.label !== next.label) {
      moved.push({
        subjectCode: next.subjectCode,
        sectionCode: next.sectionCode,
        before: prev.label,
        after: next.label,
      });
      affectedSectionIds.add(next.sectionId);
    }
  }

  const added = [...nextMap.keys()].filter((k) => !prevMap.has(k)).length;
  const removed = [...prevMap.keys()].filter((k) => !nextMap.has(k)).length;

  await db.transaction(async (tx) => {
    if (current) {
      await tx
        .update(timetableVersions)
        .set({ status: 'ARCHIVED' })
        .where(eq(timetableVersions.id, current.id));
    }

    await tx
      .update(timetableVersions)
      .set({
        status: 'PUBLISHED',
        publishedAt: new Date(),
        publishedById: user.userId,
      })
      .where(eq(timetableVersions.id, params.versionId));

    if (moved.length > 0 || added > 0 || removed > 0) {
      await tx.insert(changeEvents).values({
        institutionId: user.institutionId,
        kind: 'TIMETABLE_CHANGED',
        title: 'Timetable updated',
        summary:
          moved.length > 0
            ? `${moved.length} class${moved.length === 1 ? '' : 'es'} moved`
            : `${added} added, ${removed} removed`,
        beforeValue: { version: current?.name ?? null, entries: prevMap.size },
        afterValue: { version: version.name, entries: nextMap.size, moved: moved.slice(0, 40) },
        reason: params.reason,
        entityType: 'timetable_version',
        entityId: params.versionId,
        changedById: user.userId,
        approvedById: user.userId,
        affectedSectionIds: [...affectedSectionIds],
        affectedCount: moved.length,
        effectiveFrom: new Date(),
      });
    }
  });

  await recordAudit(user, {
    action: 'TIMETABLE_PUBLISHED',
    entityType: 'timetable_version',
    entityId: params.versionId,
    before: current ? { versionId: current.id, name: current.name } : null,
    after: { versionId: params.versionId, name: version.name, moved: moved.length },
    reason: params.reason,
  });

  return { added, removed, moved };
}
