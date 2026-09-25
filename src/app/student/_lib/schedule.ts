import type { ClassEntry, ScheduleException } from './student';
import { dayOfIso, timeToMinutes, type DayName } from './time';

/**
 * Resolves the weekly pattern plus one-off exceptions into what actually
 * happens on a given date. The weekly timetable stays clean; every deviation
 * remains an explicit, auditable record.
 */

export type OccurrenceStatus =
  | 'SCHEDULED'
  | 'CANCELLED'
  | 'ROOM_CHANGED'
  | 'FACULTY_SUBSTITUTED'
  | 'TIME_CHANGED'
  | 'ONLINE'
  | 'EXTRA_CLASS';

export interface ClassOccurrence {
  key: string;
  dateIso: string;
  day: DayName;
  position: number;
  startTime: string;
  endTime: string;
  offeringId: string;
  entryId: string | null;
  subjectCode: string;
  subjectName: string;
  subjectKind: string;
  roomCode: string | null;
  roomBuilding: string | null;
  facultyName: string | null;
  status: OccurrenceStatus;
  /** Why the class deviates from the published pattern, verbatim from the record. */
  exceptionReason: string | null;
  note: string | null;
}

function matches(exception: ScheduleException, entry: ClassEntry): boolean {
  if (exception.entryId) return exception.entryId === entry.entryId;
  if (exception.offeringId) return exception.offeringId === entry.offeringId;
  return false;
}

/** What this student's day looks like on `dateIso`, exceptions applied. */
export function occurrencesForDate(
  dateIso: string,
  classes: ClassEntry[],
  exceptions: ScheduleException[],
): ClassOccurrence[] {
  const day = dayOfIso(dateIso);
  const todays = exceptions.filter((e) => e.dateIso === dateIso);

  const occurrences: ClassOccurrence[] = classes
    .filter((c) => c.day === day)
    .map((entry) => {
      const exception = todays.find(
        (e) => e.kind !== 'EXTRA_CLASS' && matches(e, entry),
      );

      const status: OccurrenceStatus = entry.isCancelled
        ? 'CANCELLED'
        : ((exception?.kind as OccurrenceStatus) ?? 'SCHEDULED');

      return {
        key: entry.entryId,
        dateIso,
        day,
        position: exception?.newSlotPosition ?? entry.position,
        startTime: exception?.newSlotStartTime ?? entry.startTime,
        endTime: exception?.newSlotEndTime ?? entry.endTime,
        offeringId: entry.offeringId,
        entryId: entry.entryId,
        subjectCode: entry.subjectCode,
        subjectName: entry.subjectName,
        subjectKind: entry.subjectKind,
        roomCode: exception?.newRoomCode ?? entry.roomCode,
        roomBuilding: exception?.newRoomCode ? null : entry.roomBuilding,
        facultyName: exception?.newFacultyName ?? entry.facultyName,
        status,
        exceptionReason: exception?.reason ?? null,
        note: entry.note,
      };
    });

  // Extra classes exist only as exceptions — there is no weekly entry for them.
  for (const extra of todays) {
    if (extra.kind !== 'EXTRA_CLASS') continue;
    occurrences.push({
      key: `extra-${extra.id}`,
      dateIso,
      day,
      position: extra.newSlotPosition ?? 99,
      startTime: extra.newSlotStartTime ?? '00:00:00',
      endTime: extra.newSlotEndTime ?? '00:00:00',
      offeringId: extra.offeringId ?? '',
      entryId: extra.entryId,
      subjectCode: extra.subjectCode ?? 'Extra',
      subjectName: extra.subjectName ?? 'Extra class',
      subjectKind: 'THEORY',
      roomCode: extra.newRoomCode,
      roomBuilding: null,
      facultyName: extra.newFacultyName,
      status: 'EXTRA_CLASS',
      exceptionReason: extra.reason,
      note: null,
    });
  }

  return occurrences.sort((a, b) => a.position - b.position);
}

/**
 * The next class a student has to be somewhere for, searching forward from
 * `fromIso` at `fromMinutes`. Cancelled classes and holidays are skipped —
 * showing a class that will not happen is worse than showing nothing.
 */
export function findNextClass(
  fromIso: string,
  fromMinutes: number,
  classes: ClassEntry[],
  exceptions: ScheduleException[],
  holidayDates: Set<string>,
  horizonDays = 8,
): { occurrence: ClassOccurrence; isToday: boolean } | null {
  for (let offset = 0; offset < horizonDays; offset += 1) {
    const iso = addDays(fromIso, offset);
    if (holidayDates.has(iso)) continue;

    const occurrences = occurrencesForDate(iso, classes, exceptions).filter(
      (o) => o.status !== 'CANCELLED',
    );

    for (const occurrence of occurrences) {
      const start = timeToMinutes(occurrence.startTime);
      const end = timeToMinutes(occurrence.endTime);
      if (start === null || end === null) continue;
      // A class already in progress still counts as "the class you are in".
      if (offset === 0 && end <= fromMinutes) continue;
      return { occurrence, isToday: offset === 0 };
    }
  }
  return null;
}

function addDays(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
