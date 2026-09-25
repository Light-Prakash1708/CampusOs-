import 'server-only';
import { and, eq, ilike, or, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import * as t from '@/lib/db/schema';
import type { AuthContext } from '@/lib/auth/context';
import type { SolverConstraint } from './types';

/**
 * NATURAL-LANGUAGE SCHEDULING REQUIREMENTS
 * ---------------------------------------------------------------------------
 * "Professor Sharma cannot teach before 10 AM on Monday and is unavailable on
 *  Wednesday."
 *      → two HARD FACULTY_UNAVAILABLE constraints over concrete slot ids.
 *
 * DESIGN DECISION: this parser is RULE-BASED, not model-based.
 *
 * A scheduling constraint decides where hundreds of students sit for a
 * semester. A misparse is expensive and, worse, silent. So we parse with
 * explicit patterns, resolve every person and room against real database rows,
 * and REPORT BACK exactly what was understood — plus, importantly, what was
 * NOT understood, so the admin can see the gap rather than assume it was
 * handled.
 *
 * A language model may later be used to *rewrite* free text into these same
 * canonical phrasings, but the constraint objects that reach the solver will
 * still be produced here, and still be shown to a human before use.
 */

export interface ParsedRequirements {
  constraints: SolverConstraint[];
  /** What we understood, in plain English, for confirmation. */
  interpreted: string[];
  /** Sentences we could not turn into a constraint. Never silently dropped. */
  unrecognised: string[];
}

const DAY_WORDS: Record<string, string> = {
  monday: 'MONDAY', mon: 'MONDAY',
  tuesday: 'TUESDAY', tue: 'TUESDAY', tues: 'TUESDAY',
  wednesday: 'WEDNESDAY', wed: 'WEDNESDAY',
  thursday: 'THURSDAY', thu: 'THURSDAY', thur: 'THURSDAY', thurs: 'THURSDAY',
  friday: 'FRIDAY', fri: 'FRIDAY',
  saturday: 'SATURDAY', sat: 'SATURDAY',
  sunday: 'SUNDAY', sun: 'SUNDAY',
};

/** "10", "10 am", "10:30", "2pm" → minutes since midnight. */
function parseClock(raw: string): number | null {
  const m = raw.trim().toLowerCase().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/);
  if (!m) return null;
  let hour = Number(m[1]);
  const minute = Number(m[2] ?? 0);
  const period = m[3];
  if (hour > 23) return null;
  if (period === 'pm' && hour < 12) hour += 12;
  if (period === 'am' && hour === 12) hour = 0;
  // Bare "2" in a college timetable means 2 PM, not 2 AM.
  if (!period && hour < 8) hour += 12;
  return hour * 60 + minute;
}

function slotMinutes(time: string): number {
  const [h, m] = time.split(':');
  return Number(h) * 60 + Number(m ?? 0);
}

export async function parseTimetableConstraints(
  user: AuthContext,
  text: string,
): Promise<ParsedRequirements> {
  const constraints: SolverConstraint[] = [];
  const interpreted: string[] = [];
  const unrecognised: string[] = [];

  const [slots, faculty, rooms, sections] = await Promise.all([
    db
      .select()
      .from(t.timeSlots)
      .where(
        and(eq(t.timeSlots.institutionId, user.institutionId), eq(t.timeSlots.kind, 'TEACHING')),
      ),
    db
      .select({
        id: t.facultyProfiles.id,
        firstName: t.users.firstName,
        lastName: t.users.lastName,
      })
      .from(t.facultyProfiles)
      .innerJoin(t.users, eq(t.users.id, t.facultyProfiles.userId))
      .where(eq(t.facultyProfiles.institutionId, user.institutionId)),
    db
      .select({ id: t.rooms.id, code: t.rooms.code })
      .from(t.rooms)
      .where(eq(t.rooms.institutionId, user.institutionId)),
    db
      .select({ id: t.sections.id, code: t.sections.code })
      .from(t.sections)
      .where(eq(t.sections.institutionId, user.institutionId)),
  ]);

  // Split into statements on sentence and clause boundaries.
  const statements = text
    .split(/[.;\n]|(?:\s+and\s+)/i)
    .map((s) => s.trim())
    .filter((s) => s.length > 3);

  for (const statement of statements) {
    const lower = statement.toLowerCase();
    let matched = false;

    // Which person does this refer to?
    const person = faculty.find((f) => {
      const first = f.firstName.toLowerCase();
      const last = f.lastName.toLowerCase();
      return (
        lower.includes(`${first} ${last}`) ||
        (lower.includes(last) && last.length > 3) ||
        (lower.includes(first) && first.length > 3)
      );
    });

    const room = rooms.find((r) => lower.includes(r.code.toLowerCase()));
    const section = sections.find((sec) => lower.includes(sec.code.toLowerCase()));

    // Which days does it mention? No day mentioned = every day.
    const days = Object.entries(DAY_WORDS)
      .filter(([word]) => new RegExp(`\\b${word}\\b`).test(lower))
      .map(([, day]) => day);
    const dayScope = days.length > 0 ? [...new Set(days)] : null;

    const isNegative = /\b(cannot|can't|not|unavailable|no|avoid|never|busy|blocked)\b/.test(lower);

    // --- "before 10 AM" / "after 3 PM" -----------------------------------
    const beforeMatch = lower.match(/before\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/);
    const afterMatch = lower.match(/after\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/);

    let blocked = slots.filter((s) => (dayScope ? dayScope.includes(s.dayOfWeek) : true));

    if (beforeMatch) {
      const cutoff = parseClock(beforeMatch[1]!);
      if (cutoff !== null) {
        blocked = blocked.filter((s) => slotMinutes(s.startTime) < cutoff);
        matched = true;
      }
    } else if (afterMatch) {
      const cutoff = parseClock(afterMatch[1]!);
      if (cutoff !== null) {
        blocked = blocked.filter((s) => slotMinutes(s.startTime) >= cutoff);
        matched = true;
      }
    } else if (dayScope && isNegative) {
      // "unavailable on Wednesday" — the whole day.
      matched = true;
    }

    if (matched && blocked.length > 0 && isNegative) {
      if (person) {
        constraints.push({
          kind: 'FACULTY_UNAVAILABLE',
          severity: 'HARD',
          facultyId: person.id,
          slotIds: blocked.map((s) => s.id),
          description: `${person.firstName} ${person.lastName} unavailable: ${statement.trim()}`,
        });
        interpreted.push(
          `${person.firstName} ${person.lastName} will not be scheduled in ${blocked.length} period${blocked.length === 1 ? '' : 's'}${dayScope ? ` on ${dayScope.map(titleCase).join(', ')}` : ''}.`,
        );
        continue;
      }

      if (room) {
        constraints.push({
          kind: 'ROOM_UNAVAILABLE',
          severity: 'HARD',
          roomId: room.id,
          slotIds: blocked.map((s) => s.id),
          description: `Room ${room.code} unavailable: ${statement.trim()}`,
        });
        interpreted.push(
          `Room ${room.code} will not be used in ${blocked.length} period${blocked.length === 1 ? '' : 's'}${dayScope ? ` on ${dayScope.map(titleCase).join(', ')}` : ''}.`,
        );
        continue;
      }

      if (section) {
        constraints.push({
          kind: 'SECTION_UNAVAILABLE',
          severity: 'HARD',
          sectionId: section.id,
          slotIds: blocked.map((s) => s.id),
          description: `${section.code} unavailable: ${statement.trim()}`,
        });
        interpreted.push(
          `${section.code} will have no classes in ${blocked.length} period${blocked.length === 1 ? '' : 's'}${dayScope ? ` on ${dayScope.map(titleCase).join(', ')}` : ''}.`,
        );
        continue;
      }
    }

    // --- "at most N classes a day" ---------------------------------------
    const maxDaily = lower.match(/(?:at most|no more than|maximum(?: of)?)\s+(\d+)\s+(?:class|period|lecture)/);
    if (maxDaily) {
      const value = Number(maxDaily[1]);
      if (person) {
        constraints.push({
          kind: 'MAX_DAILY_HOURS',
          severity: 'SOFT',
          facultyId: person.id,
          value,
          description: `${person.firstName} ${person.lastName}: at most ${value} periods per day`,
        });
        interpreted.push(
          `${person.firstName} ${person.lastName} will be kept to about ${value} period${value === 1 ? '' : 's'} a day where possible.`,
        );
        continue;
      }
      if (section) {
        constraints.push({
          kind: 'MAX_DAILY_HOURS',
          severity: 'SOFT',
          sectionId: section.id,
          value,
          description: `${section.code}: at most ${value} periods per day`,
        });
        interpreted.push(`${section.code} will be kept to about ${value} periods a day where possible.`);
        continue;
      }
    }

    // Nothing matched — say so rather than pretending.
    unrecognised.push(statement.trim());
  }

  return { constraints, interpreted, unrecognised };
}

function titleCase(day: string): string {
  return day.charAt(0) + day.slice(1).toLowerCase();
}
