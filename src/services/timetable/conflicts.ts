import 'server-only';
import { and, eq, ne, inArray, or, isNull, gte, lte, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  timetableEntries,
  timetableVersions,
  timeSlots,
  rooms,
  sections,
  courseOfferings,
  subjects,
  facultyProfiles,
  users,
  events,
  assessments,
  assessmentAllocations,
  holidays,
  scheduleExceptions,
} from '@/lib/db/schema';

/**
 * NO-CONFLICT ENGINE
 * ---------------------------------------------------------------------------
 * Nothing that occupies a room, a person or a cohort is written without passing
 * through here first. The engine answers three questions:
 *
 *   1. Does this clash with something already scheduled?
 *   2. Exactly who and what is affected?
 *   3. What are the workable alternatives?
 *
 * It NEVER silently overwrites. A caller either resolves the conflict or
 * explicitly records an override with a reason.
 */

export type ConflictSeverity = 'BLOCKING' | 'WARNING';

export interface Conflict {
  severity: ConflictSeverity;
  kind:
    | 'ROOM_OCCUPIED'
    | 'FACULTY_BUSY'
    | 'SECTION_BUSY'
    | 'ROOM_UNAVAILABLE'
    | 'ROOM_TOO_SMALL'
    | 'ROOM_WRONG_TYPE'
    | 'EXAM_CLASH'
    | 'EVENT_CLASH'
    | 'HOLIDAY'
    | 'OUTSIDE_TEACHING_PERIOD';
  message: string;
  /** What is already there. */
  conflictingWith?: {
    type: string;
    id: string;
    label: string;
    timeLabel?: string;
  };
  affected: {
    students: number;
    faculty: number;
    sections: string[];
  };
}

export interface Alternative {
  kind: 'DIFFERENT_ROOM' | 'DIFFERENT_SLOT' | 'DIFFERENT_ROOM_AND_SLOT';
  roomId?: string;
  roomLabel?: string;
  timeSlotId?: string;
  timeLabel?: string;
  /** Why this alternative is good or imperfect. */
  note: string;
  /** 0..100 — higher is a better fit. */
  score: number;
}

export interface ConflictCheckResult {
  hasConflict: boolean;
  hasBlockingConflict: boolean;
  conflicts: Conflict[];
  alternatives: Alternative[];
  /** Total distinct people affected if this were forced through. */
  impact: { students: number; faculty: number; sections: string[] };
}

export interface SlotBookingRequest {
  institutionId: string;
  versionId: string;
  timeSlotId: string;
  roomId?: string | null;
  facultyId?: string | null;
  sectionId: string;
  /** Excluded from clash checks when editing an existing entry. */
  excludeEntryId?: string | null;
  /** Room type the subject requires, if any. */
  requiredRoomType?: string | null;
  /** Specific date, used for holiday / exam / event checks. */
  date?: Date | null;
}

/** Checks a single period booking against everything already scheduled. */
export async function checkSlotConflicts(
  request: SlotBookingRequest,
): Promise<ConflictCheckResult> {
  const conflicts: Conflict[] = [];

  const [slot] = await db
    .select()
    .from(timeSlots)
    .where(and(eq(timeSlots.id, request.timeSlotId), eq(timeSlots.institutionId, request.institutionId)))
    .limit(1);

  if (!slot) {
    return {
      hasConflict: true,
      hasBlockingConflict: true,
      conflicts: [
        {
          severity: 'BLOCKING',
          kind: 'OUTSIDE_TEACHING_PERIOD',
          message: 'That period does not exist in this institution’s timetable grid.',
          affected: { students: 0, faculty: 0, sections: [] },
        },
      ],
      alternatives: [],
      impact: { students: 0, faculty: 0, sections: [] },
    };
  }

  if (slot.kind !== 'TEACHING') {
    conflicts.push({
      severity: 'BLOCKING',
      kind: 'OUTSIDE_TEACHING_PERIOD',
      message: `${slot.label} is a ${slot.kind.toLowerCase()} period and cannot hold a class.`,
      affected: { students: 0, faculty: 0, sections: [] },
    });
  }

  // --- Existing timetable entries in the same version and period -----------
  const existing = await db
    .select({
      id: timetableEntries.id,
      roomId: timetableEntries.roomId,
      facultyId: timetableEntries.facultyId,
      sectionId: timetableEntries.sectionId,
      subjectCode: subjects.code,
      subjectName: subjects.name,
      sectionCode: sections.code,
      sectionStrength: sections.strength,
      roomCode: rooms.code,
      facultyFirstName: users.firstName,
      facultyLastName: users.lastName,
    })
    .from(timetableEntries)
    .innerJoin(courseOfferings, eq(courseOfferings.id, timetableEntries.offeringId))
    .innerJoin(subjects, eq(subjects.id, courseOfferings.subjectId))
    .innerJoin(sections, eq(sections.id, timetableEntries.sectionId))
    .leftJoin(rooms, eq(rooms.id, timetableEntries.roomId))
    .leftJoin(facultyProfiles, eq(facultyProfiles.id, timetableEntries.facultyId))
    .leftJoin(users, eq(users.id, facultyProfiles.userId))
    .where(
      and(
        eq(timetableEntries.versionId, request.versionId),
        eq(timetableEntries.timeSlotId, request.timeSlotId),
        eq(timetableEntries.isCancelled, false),
        request.excludeEntryId
          ? ne(timetableEntries.id, request.excludeEntryId)
          : sql`true`,
      ),
    );

  const timeLabel = `${slot.dayOfWeek.charAt(0)}${slot.dayOfWeek.slice(1).toLowerCase()} ${slot.startTime.slice(0, 5)}–${slot.endTime.slice(0, 5)}`;

  for (const entry of existing) {
    const facultyName = entry.facultyFirstName
      ? `${entry.facultyFirstName} ${entry.facultyLastName ?? ''}`.trim()
      : 'Unassigned';

    if (request.roomId && entry.roomId === request.roomId) {
      conflicts.push({
        severity: 'BLOCKING',
        kind: 'ROOM_OCCUPIED',
        message: `Room ${entry.roomCode} is already occupied in this period.`,
        conflictingWith: {
          type: 'class',
          id: entry.id,
          label: `${entry.subjectCode} ${entry.subjectName} · ${entry.sectionCode}`,
          timeLabel,
        },
        affected: {
          students: entry.sectionStrength,
          faculty: entry.facultyId ? 1 : 0,
          sections: [entry.sectionCode],
        },
      });
    }

    if (request.facultyId && entry.facultyId === request.facultyId) {
      conflicts.push({
        severity: 'BLOCKING',
        kind: 'FACULTY_BUSY',
        message: `${facultyName} is already teaching ${entry.subjectCode} to ${entry.sectionCode} in this period.`,
        conflictingWith: {
          type: 'class',
          id: entry.id,
          label: `${entry.subjectCode} · ${entry.sectionCode}`,
          timeLabel,
        },
        affected: { students: entry.sectionStrength, faculty: 1, sections: [entry.sectionCode] },
      });
    }

    if (entry.sectionId === request.sectionId) {
      conflicts.push({
        severity: 'BLOCKING',
        kind: 'SECTION_BUSY',
        message: `${entry.sectionCode} already has ${entry.subjectCode} in this period.`,
        conflictingWith: {
          type: 'class',
          id: entry.id,
          label: `${entry.subjectCode} ${entry.subjectName}`,
          timeLabel,
        },
        affected: { students: entry.sectionStrength, faculty: 1, sections: [entry.sectionCode] },
      });
    }
  }

  // --- Room suitability ----------------------------------------------------
  if (request.roomId) {
    const [room] = await db
      .select()
      .from(rooms)
      .where(and(eq(rooms.id, request.roomId), eq(rooms.institutionId, request.institutionId)))
      .limit(1);

    const [section] = await db
      .select({ strength: sections.strength, code: sections.code })
      .from(sections)
      .where(eq(sections.id, request.sectionId))
      .limit(1);

    if (room) {
      if (!room.isBookable) {
        conflicts.push({
          severity: 'BLOCKING',
          kind: 'ROOM_UNAVAILABLE',
          message: `Room ${room.code} is marked as not bookable.`,
          affected: { students: 0, faculty: 0, sections: [] },
        });
      }

      if (room.unavailableFrom && room.unavailableTo) {
        const now = request.date ?? new Date();
        if (now >= room.unavailableFrom && now <= room.unavailableTo) {
          conflicts.push({
            severity: 'BLOCKING',
            kind: 'ROOM_UNAVAILABLE',
            message: `Room ${room.code} is unavailable: ${room.unavailableReason ?? 'maintenance'}.`,
            affected: { students: 0, faculty: 0, sections: [] },
          });
        }
      }

      if (section && room.capacity < section.strength) {
        conflicts.push({
          severity: 'BLOCKING',
          kind: 'ROOM_TOO_SMALL',
          message: `Room ${room.code} seats ${room.capacity} but ${section.code} has ${section.strength} students.`,
          affected: { students: section.strength, faculty: 0, sections: [section.code] },
        });
      }

      if (request.requiredRoomType && room.type !== request.requiredRoomType) {
        conflicts.push({
          severity: 'WARNING',
          kind: 'ROOM_WRONG_TYPE',
          message: `This subject expects a ${request.requiredRoomType.toLowerCase()} but Room ${room.code} is a ${room.type.toLowerCase()}.`,
          affected: { students: 0, faculty: 0, sections: [] },
        });
      }
    }
  }

  // --- Date-specific checks (holidays, exams, events) ----------------------
  if (request.date) {
    const dateStr = request.date.toISOString().slice(0, 10);

    const [holiday] = await db
      .select()
      .from(holidays)
      .where(
        and(eq(holidays.institutionId, request.institutionId), eq(holidays.date, dateStr)),
      )
      .limit(1);

    if (holiday && !holiday.isHalfDay) {
      conflicts.push({
        severity: 'BLOCKING',
        kind: 'HOLIDAY',
        message: `${dateStr} is a holiday (${holiday.name}).`,
        affected: { students: 0, faculty: 0, sections: [] },
      });
    }

    const examClashes = await db
      .select({
        id: assessments.id,
        title: assessments.title,
        startsAt: assessments.startsAt,
        endsAt: assessments.endsAt,
        roomId: assessmentAllocations.roomId,
        sectionId: assessmentAllocations.sectionId,
      })
      .from(assessments)
      .leftJoin(assessmentAllocations, eq(assessmentAllocations.assessmentId, assessments.id))
      .where(
        and(
          eq(assessments.institutionId, request.institutionId),
          eq(assessments.date, dateStr),
          inArray(assessments.status, ['PUBLISHED', 'PROPOSED']),
        ),
      );

    for (const exam of examClashes) {
      if (exam.sectionId === request.sectionId || (request.roomId && exam.roomId === request.roomId)) {
        conflicts.push({
          severity: 'BLOCKING',
          kind: 'EXAM_CLASH',
          message: `An examination (${exam.title}) is scheduled at this time.`,
          conflictingWith: { type: 'exam', id: exam.id, label: exam.title },
          affected: { students: 0, faculty: 0, sections: [] },
        });
      }
    }

    const dayStart = new Date(`${dateStr}T00:00:00.000Z`);
    const dayEnd = new Date(`${dateStr}T23:59:59.999Z`);
    const eventClashes = await db
      .select({
        id: events.id,
        title: events.title,
        roomId: events.roomId,
        blocksClasses: events.blocksClasses,
        startsAt: events.startsAt,
      })
      .from(events)
      .where(
        and(
          eq(events.institutionId, request.institutionId),
          eq(events.status, 'SCHEDULED'),
          gte(events.startsAt, dayStart),
          lte(events.startsAt, dayEnd),
        ),
      );

    for (const event of eventClashes) {
      const sameRoom = request.roomId && event.roomId === request.roomId;
      if (sameRoom || event.blocksClasses) {
        conflicts.push({
          severity: sameRoom ? 'BLOCKING' : 'WARNING',
          kind: 'EVENT_CLASH',
          message: sameRoom
            ? `Room is reserved for the event “${event.title}”.`
            : `The event “${event.title}” is scheduled at this time and blocks classes.`,
          conflictingWith: { type: 'event', id: event.id, label: event.title },
          affected: { students: 0, faculty: 0, sections: [] },
        });
      }
    }
  }

  const alternatives = conflicts.some((c) => c.severity === 'BLOCKING')
    ? await suggestAlternatives(request)
    : [];

  const impact = aggregateImpact(conflicts);

  return {
    hasConflict: conflicts.length > 0,
    hasBlockingConflict: conflicts.some((c) => c.severity === 'BLOCKING'),
    conflicts,
    alternatives,
    impact,
  };
}

function aggregateImpact(conflicts: Conflict[]) {
  const sectionSet = new Set<string>();
  let students = 0;
  let faculty = 0;
  for (const c of conflicts) {
    for (const s of c.affected.sections) {
      if (!sectionSet.has(s)) {
        sectionSet.add(s);
        students += c.affected.students;
        faculty += c.affected.faculty;
      }
    }
  }
  return { students, faculty, sections: [...sectionSet] };
}

/**
 * Produces ranked, actually-free alternatives. Every suggestion is verified
 * against the database before it is offered — we never propose a room that
 * turns out to be busy.
 */
export async function suggestAlternatives(
  request: SlotBookingRequest,
  limit = 5,
): Promise<Alternative[]> {
  const suggestions: Alternative[] = [];

  const [section] = await db
    .select({ strength: sections.strength, code: sections.code, homeRoomId: sections.homeRoomId })
    .from(sections)
    .where(eq(sections.id, request.sectionId))
    .limit(1);

  const strength = section?.strength ?? 0;

  // Candidate rooms of the right type and size.
  const candidateRooms = await db
    .select()
    .from(rooms)
    .where(
      and(
        eq(rooms.institutionId, request.institutionId),
        eq(rooms.isBookable, true),
        isNull(rooms.deletedAt),
        gte(rooms.capacity, strength),
        request.requiredRoomType
          ? eq(rooms.type, request.requiredRoomType as typeof rooms.type.enumValues[number])
          : sql`true`,
      ),
    );

  // Everything already booked in this version, so we can test freeness cheaply.
  const booked = await db
    .select({
      roomId: timetableEntries.roomId,
      facultyId: timetableEntries.facultyId,
      sectionId: timetableEntries.sectionId,
      timeSlotId: timetableEntries.timeSlotId,
    })
    .from(timetableEntries)
    .where(
      and(
        eq(timetableEntries.versionId, request.versionId),
        eq(timetableEntries.isCancelled, false),
        request.excludeEntryId ? ne(timetableEntries.id, request.excludeEntryId) : sql`true`,
      ),
    );

  const roomBusy = new Set(booked.filter((b) => b.roomId).map((b) => `${b.roomId}:${b.timeSlotId}`));
  const facultyBusy = new Set(
    booked.filter((b) => b.facultyId).map((b) => `${b.facultyId}:${b.timeSlotId}`),
  );
  const sectionBusy = new Set(booked.map((b) => `${b.sectionId}:${b.timeSlotId}`));

  // Option 1 — same period, a different room.
  const sectionFreeHere = !sectionBusy.has(`${request.sectionId}:${request.timeSlotId}`);
  const facultyFreeHere =
    !request.facultyId || !facultyBusy.has(`${request.facultyId}:${request.timeSlotId}`);

  if (sectionFreeHere && facultyFreeHere) {
    for (const room of candidateRooms) {
      if (room.id === request.roomId) continue;
      if (roomBusy.has(`${room.id}:${request.timeSlotId}`)) continue;
      const waste = room.capacity - strength;
      suggestions.push({
        kind: 'DIFFERENT_ROOM',
        roomId: room.id,
        roomLabel: `Room ${room.code}`,
        note:
          room.id === section?.homeRoomId
            ? 'This is the section’s usual room.'
            : `Free in this period · seats ${room.capacity}`,
        score: 90 - Math.min(20, waste / 2) + (room.id === section?.homeRoomId ? 10 : 0),
      });
      if (suggestions.length >= limit) break;
    }
  }

  // Option 2 — same room, a different period.
  if (suggestions.length < limit) {
    const allSlots = await db
      .select()
      .from(timeSlots)
      .where(
        and(
          eq(timeSlots.institutionId, request.institutionId),
          eq(timeSlots.kind, 'TEACHING'),
        ),
      )
      .orderBy(timeSlots.dayOfWeek, timeSlots.position);

    for (const slot of allSlots) {
      if (slot.id === request.timeSlotId) continue;
      if (sectionBusy.has(`${request.sectionId}:${slot.id}`)) continue;
      if (request.facultyId && facultyBusy.has(`${request.facultyId}:${slot.id}`)) continue;

      const roomForSlot =
        request.roomId && !roomBusy.has(`${request.roomId}:${slot.id}`)
          ? request.roomId
          : candidateRooms.find((r) => !roomBusy.has(`${r.id}:${slot.id}`))?.id;

      if (!roomForSlot) continue;

      const roomCode = candidateRooms.find((r) => r.id === roomForSlot)?.code;
      const label = `${slot.dayOfWeek.charAt(0)}${slot.dayOfWeek.slice(1).toLowerCase()} ${slot.startTime.slice(0, 5)}`;

      suggestions.push({
        kind: roomForSlot === request.roomId ? 'DIFFERENT_SLOT' : 'DIFFERENT_ROOM_AND_SLOT',
        timeSlotId: slot.id,
        timeLabel: label,
        roomId: roomForSlot,
        roomLabel: roomCode ? `Room ${roomCode}` : undefined,
        note:
          roomForSlot === request.roomId
            ? 'Same room, everyone free.'
            : `Room ${roomCode} is free then.`,
        score: 70 - slot.position,
      });

      if (suggestions.length >= limit) break;
    }
  }

  return suggestions.sort((a, b) => b.score - a.score).slice(0, limit);
}

/**
 * Scans an entire timetable version for conflicts. Used by the admin dashboard
 * to report "3 timetable conflicts detected" — and it is a real scan, not a
 * cached number.
 */
export async function scanVersionConflicts(
  institutionId: string,
  versionId: string,
): Promise<{
  total: number;
  items: {
    kind: string;
    message: string;
    entryIds: string[];
    timeLabel: string;
    affectedStudents: number;
  }[];
}> {
  const entries = await db
    .select({
      id: timetableEntries.id,
      roomId: timetableEntries.roomId,
      facultyId: timetableEntries.facultyId,
      sectionId: timetableEntries.sectionId,
      timeSlotId: timetableEntries.timeSlotId,
      roomCode: rooms.code,
      roomCapacity: rooms.capacity,
      sectionCode: sections.code,
      sectionStrength: sections.strength,
      subjectCode: subjects.code,
      requiredRoomType: subjects.requiredRoomType,
      roomType: rooms.type,
      facultyFirst: users.firstName,
      facultyLast: users.lastName,
      slotLabel: timeSlots.label,
      slotDay: timeSlots.dayOfWeek,
      slotStart: timeSlots.startTime,
    })
    .from(timetableEntries)
    .innerJoin(timeSlots, eq(timeSlots.id, timetableEntries.timeSlotId))
    .innerJoin(sections, eq(sections.id, timetableEntries.sectionId))
    .innerJoin(courseOfferings, eq(courseOfferings.id, timetableEntries.offeringId))
    .innerJoin(subjects, eq(subjects.id, courseOfferings.subjectId))
    .leftJoin(rooms, eq(rooms.id, timetableEntries.roomId))
    .leftJoin(facultyProfiles, eq(facultyProfiles.id, timetableEntries.facultyId))
    .leftJoin(users, eq(users.id, facultyProfiles.userId))
    .where(
      and(
        eq(timetableEntries.institutionId, institutionId),
        eq(timetableEntries.versionId, versionId),
        eq(timetableEntries.isCancelled, false),
      ),
    );

  const items: {
    kind: string;
    message: string;
    entryIds: string[];
    timeLabel: string;
    affectedStudents: number;
  }[] = [];

  const bySlot = new Map<string, typeof entries>();
  for (const e of entries) {
    const list = bySlot.get(e.timeSlotId) ?? [];
    list.push(e);
    bySlot.set(e.timeSlotId, list);
  }

  for (const [, group] of bySlot) {
    const timeLabel = group[0]
      ? `${group[0].slotDay.charAt(0)}${group[0].slotDay.slice(1).toLowerCase()} ${group[0].slotStart.slice(0, 5)}`
      : '';

    checkDuplicates(group, (e) => e.roomId, 'ROOM_OCCUPIED', (a, b) =>
      `Room ${a.roomCode} is double-booked: ${a.subjectCode} (${a.sectionCode}) and ${b.subjectCode} (${b.sectionCode}).`,
    );
    checkDuplicates(group, (e) => e.facultyId, 'FACULTY_BUSY', (a, b) =>
      `${a.facultyFirst ?? 'A faculty member'} ${a.facultyLast ?? ''} is scheduled for both ${a.subjectCode} (${a.sectionCode}) and ${b.subjectCode} (${b.sectionCode}).`.trim(),
    );
    checkDuplicates(group, (e) => e.sectionId, 'SECTION_BUSY', (a, b) =>
      `${a.sectionCode} has two classes at once: ${a.subjectCode} and ${b.subjectCode}.`,
    );

    function checkDuplicates(
      list: typeof entries,
      key: (e: (typeof entries)[number]) => string | null,
      kind: string,
      describe: (a: (typeof entries)[number], b: (typeof entries)[number]) => string,
    ) {
      const seen = new Map<string, (typeof entries)[number]>();
      for (const e of list) {
        const k = key(e);
        if (!k) continue;
        const prev = seen.get(k);
        if (prev) {
          items.push({
            kind,
            message: describe(prev, e),
            entryIds: [prev.id, e.id],
            timeLabel,
            affectedStudents: prev.sectionStrength + e.sectionStrength,
          });
        } else {
          seen.set(k, e);
        }
      }
    }
  }

  // Capacity and room-type mismatches are conflicts too.
  for (const e of entries) {
    if (e.roomCapacity !== null && e.roomCapacity < e.sectionStrength) {
      items.push({
        kind: 'ROOM_TOO_SMALL',
        message: `Room ${e.roomCode} seats ${e.roomCapacity} but ${e.sectionCode} has ${e.sectionStrength} students.`,
        entryIds: [e.id],
        timeLabel: `${e.slotDay.charAt(0)}${e.slotDay.slice(1).toLowerCase()} ${e.slotStart.slice(0, 5)}`,
        affectedStudents: e.sectionStrength,
      });
    }
    if (e.requiredRoomType && e.roomType && e.roomType !== e.requiredRoomType) {
      items.push({
        kind: 'ROOM_WRONG_TYPE',
        message: `${e.subjectCode} needs a ${e.requiredRoomType.toLowerCase()} but is in ${e.roomType.toLowerCase()} ${e.roomCode}.`,
        entryIds: [e.id],
        timeLabel: `${e.slotDay.charAt(0)}${e.slotDay.slice(1).toLowerCase()} ${e.slotStart.slice(0, 5)}`,
        affectedStudents: e.sectionStrength,
      });
    }
  }

  return { total: items.length, items };
}
