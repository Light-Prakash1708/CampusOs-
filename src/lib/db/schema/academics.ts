import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  integer,
  jsonb,
  index,
  uniqueIndex,
  time,
  numeric,
} from 'drizzle-orm/pg-core';
import { institutions, campuses, departments, programs, terms } from './tenancy';
import { users, facultyProfiles, studentProfiles } from './people';
import {
  roomTypeEnum,
  dayOfWeekEnum,
  slotKindEnum,
  subjectKindEnum,
  timetableStatusEnum,
} from './enums';

/**
 * ACADEMIC STRUCTURE
 * ---------------------------------------------------------------------------
 * sections  : a cohort of students who move together through a timetable
 * subjects  : the catalogue entry (BBA-204 Financial Management)
 * offerings : subject taught to a section, by a faculty member, in a term
 *
 * The offering is the unit the timetable schedules and attendance attaches to.
 */

export const sections = pgTable(
  'sections',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    programId: uuid('program_id')
      .notNull()
      .references(() => programs.id, { onDelete: 'cascade' }),
    /** e.g. "A", "B", "Section 2" */
    name: text('name').notNull(),
    code: text('code').notNull(),
    year: integer('year').notNull(),
    semester: integer('semester').notNull(),
    strength: integer('strength').notNull().default(0),
    /** Optional home room — used to bias the solver toward stable locations. */
    homeRoomId: uuid('home_room_id'),
    classRepresentativeId: uuid('class_representative_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    facultyAdvisorId: uuid('faculty_advisor_id').references(() => facultyProfiles.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    index('sections_institution_idx').on(t.institutionId),
    index('sections_program_idx').on(t.programId),
    uniqueIndex('sections_code_uq').on(t.institutionId, t.code),
  ],
);

export const subjects = pgTable(
  'subjects',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    departmentId: uuid('department_id')
      .notNull()
      .references(() => departments.id, { onDelete: 'restrict' }),
    code: text('code').notNull(),
    name: text('name').notNull(),
    kind: subjectKindEnum('kind').notNull().default('THEORY'),
    credits: integer('credits').notNull().default(3),
    /** How many periods per week the solver must place. */
    weeklyHours: integer('weekly_hours').notNull().default(3),
    /** Lab subjects need consecutive periods; solver treats this as a block size. */
    consecutiveBlockSize: integer('consecutive_block_size').notNull().default(1),
    /** Restricts eligible rooms. */
    requiredRoomType: roomTypeEnum('required_room_type').default('CLASSROOM'),
    semester: integer('semester').notNull().default(1),
    description: text('description'),
    /** Course outcomes → mapped to skills for the employability engine. */
    outcomes: jsonb('outcomes').$type<string[]>().default([]),
    syllabusUrl: text('syllabus_url'),
    isElective: boolean('is_elective').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    index('subjects_institution_idx').on(t.institutionId),
    index('subjects_department_idx').on(t.departmentId),
    uniqueIndex('subjects_code_uq').on(t.institutionId, t.code),
  ],
);

export const rooms = pgTable(
  'rooms',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    campusId: uuid('campus_id').references(() => campuses.id, { onDelete: 'set null' }),
    /** Room number as humans refer to it: "301", "Lab A". */
    code: text('code').notNull(),
    name: text('name'),
    type: roomTypeEnum('type').notNull().default('CLASSROOM'),
    capacity: integer('capacity').notNull().default(60),
    building: text('building'),
    floor: text('floor'),
    /** e.g. ["PROJECTOR","AC","SMARTBOARD"] — used for eligibility checks. */
    facilities: jsonb('facilities').$type<string[]>().default([]),
    /** Department that owns the room; others can still be allocated it. */
    ownerDepartmentId: uuid('owner_department_id').references(() => departments.id, {
      onDelete: 'set null',
    }),
    isBookable: boolean('is_bookable').notNull().default(true),
    /** Blocks the room for maintenance windows; conflict engine honours these. */
    unavailableFrom: timestamp('unavailable_from', { withTimezone: true }),
    unavailableTo: timestamp('unavailable_to', { withTimezone: true }),
    unavailableReason: text('unavailable_reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    index('rooms_institution_idx').on(t.institutionId),
    uniqueIndex('rooms_code_uq').on(t.institutionId, t.code),
    index('rooms_type_idx').on(t.institutionId, t.type),
  ],
);

/** The institution's period grid — e.g. P1 09:00-10:00, P2 10:00-11:00. */
export const timeSlots = pgTable(
  'time_slots',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    label: text('label').notNull(),
    dayOfWeek: dayOfWeekEnum('day_of_week').notNull(),
    startTime: time('start_time').notNull(),
    endTime: time('end_time').notNull(),
    kind: slotKindEnum('kind').notNull().default('TEACHING'),
    /** Ordering within the day, 1-based. */
    position: integer('position').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('time_slots_institution_idx').on(t.institutionId),
    uniqueIndex('time_slots_uq').on(t.institutionId, t.dayOfWeek, t.position),
  ],
);

/** Subject + section + faculty + term. The schedulable, gradable unit. */
export const courseOfferings = pgTable(
  'course_offerings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    termId: uuid('term_id')
      .notNull()
      .references(() => terms.id, { onDelete: 'cascade' }),
    subjectId: uuid('subject_id')
      .notNull()
      .references(() => subjects.id, { onDelete: 'restrict' }),
    sectionId: uuid('section_id')
      .notNull()
      .references(() => sections.id, { onDelete: 'cascade' }),
    facultyId: uuid('faculty_id').references(() => facultyProfiles.id, { onDelete: 'set null' }),
    /** Optional co-teacher / lab assistant. */
    secondaryFacultyId: uuid('secondary_faculty_id').references(() => facultyProfiles.id, {
      onDelete: 'set null',
    }),
    /** Overrides subject.weeklyHours when a section needs a different load. */
    weeklyHoursOverride: integer('weekly_hours_override'),
    minAttendancePercentage: numeric('min_attendance_percentage', { precision: 5, scale: 2 })
      .notNull()
      .default('75'),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    index('course_offerings_institution_idx').on(t.institutionId),
    index('course_offerings_term_idx').on(t.termId),
    index('course_offerings_faculty_idx').on(t.facultyId),
    index('course_offerings_section_idx').on(t.sectionId),
    uniqueIndex('course_offerings_uq').on(t.termId, t.subjectId, t.sectionId),
  ],
);

/** Students attached to an offering. Section-wide by default, but electives differ. */
export const enrollments = pgTable(
  'enrollments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    offeringId: uuid('offering_id')
      .notNull()
      .references(() => courseOfferings.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id')
      .notNull()
      .references(() => studentProfiles.id, { onDelete: 'cascade' }),
    enrolledAt: timestamp('enrolled_at', { withTimezone: true }).notNull().defaultNow(),
    droppedAt: timestamp('dropped_at', { withTimezone: true }),
    finalGrade: text('final_grade'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('enrollments_uq').on(t.offeringId, t.studentId),
    index('enrollments_student_idx').on(t.studentId),
    index('enrollments_offering_idx').on(t.offeringId),
  ],
);

/**
 * A timetable version. Editing never mutates a published timetable in place:
 * the admin works on a DRAFT, the solver produces a PROPOSED version, and
 * publishing swaps the active pointer. That gives us diffing ("what changed"),
 * rollback, and a clean approval boundary.
 */
export const timetableVersions = pgTable(
  'timetable_versions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    termId: uuid('term_id')
      .notNull()
      .references(() => terms.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    status: timetableStatusEnum('status').notNull().default('DRAFT'),
    /** Incrementing per term for human-readable versioning. */
    versionNumber: integer('version_number').notNull().default(1),
    /** Solver diagnostics: score, unplaced sessions, constraint violations. */
    solverReport: jsonb('solver_report').$type<Record<string, unknown>>(),
    generatedBy: text('generated_by').notNull().default('MANUAL'),
    createdById: uuid('created_by_id').references(() => users.id, { onDelete: 'set null' }),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    publishedById: uuid('published_by_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('timetable_versions_institution_idx').on(t.institutionId),
    index('timetable_versions_term_idx').on(t.termId, t.status),
  ],
);

/**
 * One scheduled period. The (version, slot, room) and (version, slot, faculty)
 * and (version, slot, section) triples are each unique — enforced by partial
 * unique indexes in the migration so the DATABASE prevents double-booking,
 * not just the UI. See DATABASE.md §Conflict protection.
 */
export const timetableEntries = pgTable(
  'timetable_entries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    versionId: uuid('version_id')
      .notNull()
      .references(() => timetableVersions.id, { onDelete: 'cascade' }),
    offeringId: uuid('offering_id')
      .notNull()
      .references(() => courseOfferings.id, { onDelete: 'cascade' }),
    timeSlotId: uuid('time_slot_id')
      .notNull()
      .references(() => timeSlots.id, { onDelete: 'restrict' }),
    roomId: uuid('room_id').references(() => rooms.id, { onDelete: 'set null' }),
    /** Denormalised for fast conflict queries and index coverage. */
    facultyId: uuid('faculty_id').references(() => facultyProfiles.id, { onDelete: 'set null' }),
    sectionId: uuid('section_id')
      .notNull()
      .references(() => sections.id, { onDelete: 'cascade' }),
    dayOfWeek: dayOfWeekEnum('day_of_week').notNull(),
    /** Optimistic locking — concurrent admin edits fail loudly instead of silently. */
    version: integer('version').notNull().default(1),
    isCancelled: boolean('is_cancelled').notNull().default(false),
    note: text('note'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('timetable_entries_version_idx').on(t.versionId),
    index('timetable_entries_room_slot_idx').on(t.versionId, t.roomId, t.timeSlotId),
    index('timetable_entries_faculty_slot_idx').on(t.versionId, t.facultyId, t.timeSlotId),
    index('timetable_entries_section_slot_idx').on(t.versionId, t.sectionId, t.timeSlotId),
    index('timetable_entries_offering_idx').on(t.offeringId),
  ],
);

/**
 * A one-off deviation from the published timetable for a specific date:
 * cancellation, room move, substitute faculty, or an extra class.
 * Keeping these separate from `timetable_entries` means the weekly pattern
 * stays clean and every exception is explicitly auditable.
 */
export const scheduleExceptions = pgTable(
  'schedule_exceptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    entryId: uuid('entry_id').references(() => timetableEntries.id, { onDelete: 'cascade' }),
    offeringId: uuid('offering_id').references(() => courseOfferings.id, { onDelete: 'cascade' }),
    date: timestamp('date', { withTimezone: true }).notNull(),
    /** CANCELLED | ROOM_CHANGED | FACULTY_SUBSTITUTED | TIME_CHANGED | EXTRA_CLASS | ONLINE */
    kind: text('kind').notNull(),
    newRoomId: uuid('new_room_id').references(() => rooms.id, { onDelete: 'set null' }),
    newFacultyId: uuid('new_faculty_id').references(() => facultyProfiles.id, {
      onDelete: 'set null',
    }),
    newTimeSlotId: uuid('new_time_slot_id').references(() => timeSlots.id, { onDelete: 'set null' }),
    reason: text('reason').notNull(),
    createdById: uuid('created_by_id').references(() => users.id, { onDelete: 'set null' }),
    approvedById: uuid('approved_by_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('schedule_exceptions_institution_idx').on(t.institutionId),
    index('schedule_exceptions_date_idx').on(t.institutionId, t.date),
    index('schedule_exceptions_entry_idx').on(t.entryId),
  ],
);
