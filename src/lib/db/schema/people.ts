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
  date,
  numeric,
} from 'drizzle-orm/pg-core';
import { institutions, campuses, departments, programs } from './tenancy';
import { userRoleEnum, userStatusEnum } from './enums';

/**
 * PEOPLE
 * ---------------------------------------------------------------------------
 * One `users` row per human. Role-specific data lives in `student_profiles` /
 * `faculty_profiles`. A user always belongs to exactly one institution — cross
 * -institution identity is deliberately out of scope (documented in AUTH.md).
 */

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    /** bcrypt hash. Never returned by any query that reaches the client. */
    passwordHash: text('password_hash'),
    firstName: text('first_name').notNull(),
    lastName: text('last_name').notNull(),
    displayName: text('display_name'),
    phone: text('phone'),
    avatarUrl: text('avatar_url'),
    role: userRoleEnum('role').notNull(),
    /** Additional roles beyond the primary one (e.g. FACULTY who is also HOD). */
    secondaryRoles: jsonb('secondary_roles').$type<string[]>().default([]),
    status: userStatusEnum('status').notNull().default('ACTIVE'),
    departmentId: uuid('department_id').references(() => departments.id, { onDelete: 'set null' }),
    campusId: uuid('campus_id').references(() => campuses.id, { onDelete: 'set null' }),

    locale: text('locale').notNull().default('en'),
    /** UI preferences: theme, density, pinned nav items. */
    preferences: jsonb('preferences').$type<Record<string, unknown>>().default({}),

    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
    failedLoginAttempts: integer('failed_login_attempts').notNull().default(0),
    lockedUntil: timestamp('locked_until', { withTimezone: true }),
    mustChangePassword: boolean('must_change_password').notNull().default(false),
    /** Invalidates all issued sessions when bumped (logout-everywhere, role change). */
    sessionEpoch: integer('session_epoch').notNull().default(0),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('users_email_uq').on(t.institutionId, t.email),
    index('users_institution_idx').on(t.institutionId),
    index('users_role_idx').on(t.institutionId, t.role),
    index('users_department_idx').on(t.departmentId),
  ],
);

export const studentProfiles = pgTable(
  'student_profiles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** Institutional roll/enrolment number — the identifier a college actually uses. */
    rollNumber: text('roll_number').notNull(),
    admissionNumber: text('admission_number'),
    programId: uuid('program_id')
      .notNull()
      .references(() => programs.id, { onDelete: 'restrict' }),
    sectionId: uuid('section_id'),
    /** 1-based year of study. */
    currentYear: integer('current_year').notNull().default(1),
    currentSemester: integer('current_semester').notNull().default(1),
    admissionDate: date('admission_date'),
    expectedGraduation: date('expected_graduation'),
    dateOfBirth: date('date_of_birth'),
    gender: text('gender'),
    bloodGroup: text('blood_group'),
    guardianName: text('guardian_name'),
    guardianPhone: text('guardian_phone'),
    guardianEmail: text('guardian_email'),
    /** Cached rollup, recomputed by the analytics service; never the source of truth. */
    attendancePercentage: numeric('attendance_percentage', { precision: 5, scale: 2 }),
    cgpa: numeric('cgpa', { precision: 4, scale: 2 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('student_profiles_user_uq').on(t.userId),
    uniqueIndex('student_profiles_roll_uq').on(t.institutionId, t.rollNumber),
    index('student_profiles_program_idx').on(t.programId),
    index('student_profiles_section_idx').on(t.sectionId),
  ],
);

export const facultyProfiles = pgTable(
  'faculty_profiles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    employeeCode: text('employee_code').notNull(),
    designation: text('designation').notNull().default('Assistant Professor'),
    departmentId: uuid('department_id')
      .notNull()
      .references(() => departments.id, { onDelete: 'restrict' }),
    /** Subject areas this faculty member can teach — drives substitute suggestions. */
    specializations: jsonb('specializations').$type<string[]>().default([]),
    qualifications: text('qualifications'),
    joiningDate: date('joining_date'),
    employmentType: text('employment_type').notNull().default('FULL_TIME'),
    /** Contracted teaching load; the workload engine compares actuals against this. */
    maxWeeklyTeachingHours: integer('max_weekly_teaching_hours').notNull().default(18),
    /** Structured availability windows used as hard constraints by the solver.
     *  Shape: [{ day: 'MONDAY', from: '10:00', to: '17:00' }] — empty = always available. */
    availability: jsonb('availability')
      .$type<{ day: string; from: string; to: string }[]>()
      .default([]),
    /** Free-text constraints captured from natural language, kept for audit/explanation. */
    constraintNotes: text('constraint_notes'),
    isAvailableForSubstitution: boolean('is_available_for_substitution').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('faculty_profiles_user_uq').on(t.userId),
    uniqueIndex('faculty_profiles_code_uq').on(t.institutionId, t.employeeCode),
    index('faculty_profiles_department_idx').on(t.departmentId),
  ],
);

/**
 * Server-side session records. The JWT cookie is the transport; this table is
 * the authority, so sessions can be revoked instantly (device list, force
 * logout, role change). See AUTH.md.
 */
export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    /** SHA-256 of the token id — the raw token is never stored. */
    tokenHash: text('token_hash').notNull(),
    userAgent: text('user_agent'),
    ipAddress: text('ip_address'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('sessions_token_uq').on(t.tokenHash),
    index('sessions_user_idx').on(t.userId),
    index('sessions_expiry_idx').on(t.expiresAt),
  ],
);
