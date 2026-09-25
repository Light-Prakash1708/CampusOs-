import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  integer,
  index,
  uniqueIndex,
  date,
} from 'drizzle-orm/pg-core';
import { institutions } from './tenancy';
import { users, studentProfiles, facultyProfiles } from './people';
import { courseOfferings, timetableEntries, rooms } from './academics';
import { attendanceStatusEnum, attendanceSessionStatusEnum } from './enums';

/**
 * ATTENDANCE
 * ---------------------------------------------------------------------------
 * Modelled as sessions (one class meeting) + records (one per student).
 * Corrections are never destructive: the original value is preserved on the
 * record and every change is written to the audit log. A student disputing
 * attendance opens a grievance, which links back to the record.
 */

export const attendanceSessions = pgTable(
  'attendance_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    offeringId: uuid('offering_id')
      .notNull()
      .references(() => courseOfferings.id, { onDelete: 'cascade' }),
    /** Links back to the scheduled period this session came from, when applicable. */
    timetableEntryId: uuid('timetable_entry_id').references(() => timetableEntries.id, {
      onDelete: 'set null',
    }),
    date: date('date').notNull(),
    startsAt: timestamp('starts_at', { withTimezone: true }),
    endsAt: timestamp('ends_at', { withTimezone: true }),
    roomId: uuid('room_id').references(() => rooms.id, { onDelete: 'set null' }),
    takenById: uuid('taken_by_id').references(() => facultyProfiles.id, { onDelete: 'set null' }),
    status: attendanceSessionStatusEnum('status').notNull().default('SCHEDULED'),
    topicCovered: text('topic_covered'),
    /** Denormalised counts, maintained transactionally with record writes. */
    presentCount: integer('present_count').notNull().default(0),
    absentCount: integer('absent_count').notNull().default(0),
    totalCount: integer('total_count').notNull().default(0),
    submittedAt: timestamp('submitted_at', { withTimezone: true }),
    /** Once locked, only an approved correction can alter records. */
    lockedAt: timestamp('locked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('attendance_sessions_institution_idx').on(t.institutionId),
    index('attendance_sessions_offering_idx').on(t.offeringId, t.date),
    uniqueIndex('attendance_sessions_uq').on(t.offeringId, t.date, t.timetableEntryId),
  ],
);

export const attendanceRecords = pgTable(
  'attendance_records',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => attendanceSessions.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id')
      .notNull()
      .references(() => studentProfiles.id, { onDelete: 'cascade' }),
    status: attendanceStatusEnum('status').notNull().default('ABSENT'),
    /** Preserved when a correction is applied — never overwritten. */
    originalStatus: attendanceStatusEnum('original_status'),
    markedById: uuid('marked_by_id').references(() => users.id, { onDelete: 'set null' }),
    markedAt: timestamp('marked_at', { withTimezone: true }).notNull().defaultNow(),
    correctedById: uuid('corrected_by_id').references(() => users.id, { onDelete: 'set null' }),
    correctedAt: timestamp('corrected_at', { withTimezone: true }),
    correctionReason: text('correction_reason'),
    /** Set when the correction originated from a grievance case. */
    correctionGrievanceId: uuid('correction_grievance_id'),
    note: text('note'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('attendance_records_uq').on(t.sessionId, t.studentId),
    index('attendance_records_student_idx').on(t.studentId),
    index('attendance_records_institution_idx').on(t.institutionId),
  ],
);

/**
 * Rollup cache per student per offering. Recomputed on write; the raw records
 * remain the source of truth. Exists so dashboards and shortage reports do not
 * scan the full record table on every page load.
 */
export const attendanceSummaries = pgTable(
  'attendance_summaries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id')
      .notNull()
      .references(() => studentProfiles.id, { onDelete: 'cascade' }),
    offeringId: uuid('offering_id')
      .notNull()
      .references(() => courseOfferings.id, { onDelete: 'cascade' }),
    heldSessions: integer('held_sessions').notNull().default(0),
    attendedSessions: integer('attended_sessions').notNull().default(0),
    /** Stored as basis points (7550 = 75.50%) to avoid float drift. */
    percentageBp: integer('percentage_bp').notNull().default(0),
    isBelowThreshold: boolean('is_below_threshold').notNull().default(false),
    /** How many further absences before dropping below the required minimum. */
    absenceHeadroom: integer('absence_headroom').notNull().default(0),
    recomputedAt: timestamp('recomputed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('attendance_summaries_uq').on(t.studentId, t.offeringId),
    index('attendance_summaries_threshold_idx').on(t.institutionId, t.isBelowThreshold),
  ],
);
