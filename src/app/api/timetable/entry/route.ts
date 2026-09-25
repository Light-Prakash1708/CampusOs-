import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import * as t from '@/lib/db/schema';
import { withAuth, ok, parseBody, AppError, ConflictError, NotFoundError } from '@/lib/api';
import { checkSlotConflicts } from '@/services/timetable/conflicts';
import { recordAudit } from '@/services/audit';
import { recordChange } from '@/services/communication';

const MoveBody = z.object({
  entryId: z.string().uuid(),
  timeSlotId: z.string().uuid().optional(),
  roomId: z.string().uuid().nullable().optional(),
  facultyId: z.string().uuid().nullable().optional(),
  reason: z.string().trim().min(5, 'A reason is required — it is shown to everyone affected.').max(500),
  /** Optimistic lock: the version the client last saw. */
  expectedVersion: z.number().int().optional(),
  /** Deliberate override of a non-blocking warning. */
  acceptWarnings: z.boolean().optional(),
});

/**
 * Moves a scheduled period.
 *
 * The write goes through: validate → conflict check → apply → change event →
 * notify → audit. A blocking conflict aborts with alternatives attached, and
 * the database's unique indexes are the final backstop against a race.
 */
export const PATCH = withAuth('timetable:edit', async (request, { user }) => {
  const input = await parseBody(request, MoveBody);

  const [entry] = await db
    .select({
      id: t.timetableEntries.id,
      versionId: t.timetableEntries.versionId,
      offeringId: t.timetableEntries.offeringId,
      sectionId: t.timetableEntries.sectionId,
      timeSlotId: t.timetableEntries.timeSlotId,
      roomId: t.timetableEntries.roomId,
      facultyId: t.timetableEntries.facultyId,
      version: t.timetableEntries.version,
      subjectCode: t.subjects.code,
      subjectName: t.subjects.name,
      requiredRoomType: t.subjects.requiredRoomType,
      sectionCode: t.sections.code,
      sectionStrength: t.sections.strength,
    })
    .from(t.timetableEntries)
    .innerJoin(t.courseOfferings, eq(t.courseOfferings.id, t.timetableEntries.offeringId))
    .innerJoin(t.subjects, eq(t.subjects.id, t.courseOfferings.subjectId))
    .innerJoin(t.sections, eq(t.sections.id, t.timetableEntries.sectionId))
    .where(
      and(
        eq(t.timetableEntries.id, input.entryId),
        eq(t.timetableEntries.institutionId, user.institutionId),
      ),
    )
    .limit(1);

  if (!entry) throw new NotFoundError('Timetable entry');

  // Optimistic locking: refuse to overwrite a concurrent edit.
  if (input.expectedVersion !== undefined && input.expectedVersion !== entry.version) {
    throw new ConflictError(
      'Someone else changed this class while you were editing.',
      { yourVersion: input.expectedVersion, currentVersion: entry.version },
      'Refresh to see the current schedule, then reapply your change.',
    );
  }

  const nextSlotId = input.timeSlotId ?? entry.timeSlotId;
  const nextRoomId = input.roomId !== undefined ? input.roomId : entry.roomId;
  const nextFacultyId = input.facultyId !== undefined ? input.facultyId : entry.facultyId;

  const unchanged =
    nextSlotId === entry.timeSlotId &&
    nextRoomId === entry.roomId &&
    nextFacultyId === entry.facultyId;

  if (unchanged) {
    throw new AppError('Nothing was changed.', 400, 'NO_CHANGE');
  }

  const check = await checkSlotConflicts({
    institutionId: user.institutionId,
    versionId: entry.versionId,
    timeSlotId: nextSlotId,
    sectionId: entry.sectionId,
    roomId: nextRoomId,
    facultyId: nextFacultyId,
    excludeEntryId: entry.id,
    requiredRoomType: entry.requiredRoomType,
  });

  if (check.hasBlockingConflict) {
    throw new ConflictError(
      check.conflicts.find((c) => c.severity === 'BLOCKING')?.message ??
        'That move conflicts with something already scheduled.',
      { conflicts: check.conflicts, alternatives: check.alternatives, impact: check.impact },
      check.alternatives.length
        ? 'Pick one of the suggested alternatives, or free the resource first.'
        : 'Free the conflicting booking first.',
    );
  }

  if (check.hasConflict && !input.acceptWarnings) {
    throw new ConflictError(
      check.conflicts[0]?.message ?? 'This move has a warning.',
      { conflicts: check.conflicts, alternatives: check.alternatives, requiresConfirmation: true },
      'Confirm to proceed anyway — the warning will be recorded with your reason.',
    );
  }

  // Describe the change in the terms people actually care about.
  const [beforeSlot, afterSlot] = await Promise.all([
    db.select().from(t.timeSlots).where(eq(t.timeSlots.id, entry.timeSlotId)).limit(1),
    db.select().from(t.timeSlots).where(eq(t.timeSlots.id, nextSlotId)).limit(1),
  ]);
  const [beforeRoom, afterRoom] = await Promise.all([
    entry.roomId
      ? db.select({ code: t.rooms.code }).from(t.rooms).where(eq(t.rooms.id, entry.roomId)).limit(1)
      : Promise.resolve([]),
    nextRoomId
      ? db.select({ code: t.rooms.code }).from(t.rooms).where(eq(t.rooms.id, nextRoomId)).limit(1)
      : Promise.resolve([]),
  ]);

  const fmt = (slot: typeof beforeSlot[number] | undefined, roomCode?: string) =>
    slot
      ? `${slot.dayOfWeek.charAt(0)}${slot.dayOfWeek.slice(1).toLowerCase()} ${slot.startTime.slice(0, 5)}${roomCode ? ` · Room ${roomCode}` : ''}`
      : 'Unscheduled';

  const beforeLabel = fmt(beforeSlot[0], beforeRoom[0]?.code);
  const afterLabel = fmt(afterSlot[0], afterRoom[0]?.code);

  await db
    .update(t.timetableEntries)
    .set({
      timeSlotId: nextSlotId,
      roomId: nextRoomId,
      facultyId: nextFacultyId,
      dayOfWeek: afterSlot[0]!.dayOfWeek,
      version: entry.version + 1,
      note: input.reason,
    })
    .where(
      and(
        eq(t.timetableEntries.id, entry.id),
        // Second half of the optimistic lock — the row must still be as we read it.
        eq(t.timetableEntries.version, entry.version),
      ),
    );

  const kind =
    nextSlotId !== entry.timeSlotId
      ? 'TIMETABLE_CHANGED'
      : nextFacultyId !== entry.facultyId
        ? 'FACULTY_CHANGED'
        : 'ROOM_CHANGED';

  await recordChange(user, {
    kind,
    title: `${entry.subjectCode} ${entry.subjectName} — ${entry.sectionCode}`,
    summary: `${beforeLabel} → ${afterLabel}`,
    reason: input.reason,
    entityType: 'timetable_entry',
    entityId: entry.id,
    before: { slot: beforeLabel, roomId: entry.roomId, facultyId: entry.facultyId },
    after: { slot: afterLabel, roomId: nextRoomId, facultyId: nextFacultyId },
    affectedSectionIds: [entry.sectionId],
  });

  await recordAudit(user, {
    action: 'TIMETABLE_ENTRY_UPDATED',
    entityType: 'timetable_entry',
    entityId: entry.id,
    before: { timeSlotId: entry.timeSlotId, roomId: entry.roomId, facultyId: entry.facultyId },
    after: { timeSlotId: nextSlotId, roomId: nextRoomId, facultyId: nextFacultyId },
    reason: input.reason,
  });

  return ok({
    updated: true,
    before: beforeLabel,
    after: afterLabel,
    affectedStudents: entry.sectionStrength,
    warnings: check.conflicts.filter((c) => c.severity === 'WARNING').map((c) => c.message),
  });
});
