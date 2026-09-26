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
import { subscriptionTierEnum } from './enums';

/**
 * TENANCY
 * ---------------------------------------------------------------------------
 * Institution is the tenant root. EVERY other table in CampusOS carries an
 * `institution_id` so that a single deployment can safely host many colleges.
 * There is no "default institution" fallback anywhere in the codebase — the
 * first college is simply the first tenant.
 */

export const institutions = pgTable(
  'institutions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** URL-safe tenant key, e.g. "demo-university". Used for subdomain routing later. */
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    shortName: text('short_name'),
    /** White-label branding — never hard-code CampusOS branding in components. */
    logoUrl: text('logo_url'),
    primaryColor: text('primary_color').default('#4F46E5'),
    /** Institution-specific vocabulary, e.g. { "section": "Batch" }. */
    terminology: jsonb('terminology').$type<Record<string, string>>().default({}),
    timezone: text('timezone').notNull().default('Asia/Kolkata'),
    locale: text('locale').notNull().default('en'),
    contactEmail: text('contact_email'),
    contactPhone: text('contact_phone'),
    addressLine: text('address_line'),
    city: text('city'),
    state: text('state'),
    country: text('country').default('India'),
    /** Campus coordinates for "events near your college" (CampusOS 2.0). */
    latitude: numeric('latitude', { precision: 9, scale: 6 }),
    longitude: numeric('longitude', { precision: 9, scale: 6 }),

    subscriptionTier: subscriptionTierEnum('subscription_tier').notNull().default('STARTER'),
    /** Per-tenant feature toggles; see src/lib/features.ts for the canonical list. */
    featureFlags: jsonb('feature_flags').$type<Record<string, boolean>>().default({}),
    /**
     * Self-registration policy (CampusOS 2.0). See docs/AUTH.md §Registration.
     *   mode DISABLED        — accounts only via invite/import (default)
     *   mode EMAIL_DOMAIN    — open to verified addresses on `allowedDomains`
     *   mode ADMIN_APPROVAL  — anyone may apply; an administrator activates
     */
    registrationPolicy: jsonb('registration_policy')
      .$type<{ mode: 'DISABLED' | 'EMAIL_DOMAIN' | 'ADMIN_APPROVAL'; allowedDomains?: string[] }>()
      .notNull()
      .default({ mode: 'DISABLED' }),
    /**
     * Attendance rules the college controls (Student OS Phase 2). Parsed with
     * defaults by services/attendance/policy.ts — an empty object is valid:
     *   defaultMinimumPct    minimum applied to classes (per-class values in
     *                        course_offerings.min_attendance_percentage stay
     *                        authoritative; the admin can apply this to all)
     *   warningMarginPct     percentage points above the minimum that count as
     *                        "close to the line" (risk state WATCH)
     *   aggregateMinimumPct  optional minimum across all subjects combined
     */
    attendancePolicy: jsonb('attendance_policy')
      .$type<{ defaultMinimumPct?: number; warningMarginPct?: number; aggregateMinimumPct?: number | null }>()
      .notNull()
      .default({}),
    /** Shown in public college discovery (registration picker, event discovery). */
    isListed: boolean('is_listed').notNull().default(false),
    /**
     * COLLEGE   — an institution provisioned by CampusOS or a college admin.
     * PERSONAL  — a private workspace created for one self-registered student
     *             (services/auth/accounts.ts registerIndependentStudent). It
     *             is never listed, never accepts registrations and has no
     *             administrators; the tenant boundary isolates the student.
     */
    kind: text('kind').$type<'COLLEGE' | 'PERSONAL'>().notNull().default('COLLEGE'),
    /** Setup wizard progress; the institution is not "live" until completed. */
    setupCompletedAt: timestamp('setup_completed_at', { withTimezone: true }),
    isActive: boolean('is_active').notNull().default(true),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [uniqueIndex('institutions_slug_uq').on(t.slug)],
);

export const campuses = pgTable(
  'campuses',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    code: text('code').notNull(),
    addressLine: text('address_line'),
    city: text('city'),
    isPrimary: boolean('is_primary').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    index('campuses_institution_idx').on(t.institutionId),
    uniqueIndex('campuses_code_uq').on(t.institutionId, t.code),
  ],
);

export const departments = pgTable(
  'departments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    campusId: uuid('campus_id').references(() => campuses.id, { onDelete: 'set null' }),
    name: text('name').notNull(),
    code: text('code').notNull(),
    /** Optional grouping layer (School of Management, Faculty of Science...). */
    school: text('school'),
    /** Set once faculty exist; enforced at the service layer, not by FK, to avoid a cycle. */
    headOfDepartmentId: uuid('head_of_department_id'),
    email: text('email'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    index('departments_institution_idx').on(t.institutionId),
    uniqueIndex('departments_code_uq').on(t.institutionId, t.code),
  ],
);

export const programs = pgTable(
  'programs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    departmentId: uuid('department_id')
      .notNull()
      .references(() => departments.id, { onDelete: 'restrict' }),
    name: text('name').notNull(),
    code: text('code').notNull(),
    /** e.g. UG / PG / DIPLOMA / PHD */
    level: text('level').notNull().default('UG'),
    durationYears: integer('duration_years').notNull().default(3),
    totalSemesters: integer('total_semesters').notNull().default(6),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    index('programs_institution_idx').on(t.institutionId),
    index('programs_department_idx').on(t.departmentId),
    uniqueIndex('programs_code_uq').on(t.institutionId, t.code),
  ],
);

export const academicYears = pgTable(
  'academic_years',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    /** e.g. "2026-27" */
    label: text('label').notNull(),
    startDate: date('start_date').notNull(),
    endDate: date('end_date').notNull(),
    isCurrent: boolean('is_current').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('academic_years_institution_idx').on(t.institutionId),
    uniqueIndex('academic_years_label_uq').on(t.institutionId, t.label),
  ],
);

export const terms = pgTable(
  'terms',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    academicYearId: uuid('academic_year_id')
      .notNull()
      .references(() => academicYears.id, { onDelete: 'cascade' }),
    /** e.g. "Odd Semester 2026-27" */
    name: text('name').notNull(),
    /** 1..N within the programme structure */
    semesterNumber: integer('semester_number').notNull(),
    startDate: date('start_date').notNull(),
    endDate: date('end_date').notNull(),
    /** Teaching ends before exams begin; used by the conflict engine. */
    teachingEndDate: date('teaching_end_date'),
    isCurrent: boolean('is_current').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('terms_institution_idx').on(t.institutionId),
    index('terms_year_idx').on(t.academicYearId),
  ],
);

/** Non-teaching days. The conflict engine refuses to schedule anything on these. */
export const holidays = pgTable(
  'holidays',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    campusId: uuid('campus_id').references(() => campuses.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    date: date('date').notNull(),
    /** Half-days still allow morning slots. */
    isHalfDay: boolean('is_half_day').notNull().default(false),
    description: text('description'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('holidays_institution_idx').on(t.institutionId),
    index('holidays_date_idx').on(t.institutionId, t.date),
  ],
);
