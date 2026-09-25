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
  numeric,
  date,
} from 'drizzle-orm/pg-core';
import { institutions, departments, terms } from './tenancy';
import { users, facultyProfiles } from './people';
import { courseOfferings } from './academics';
import {
  workloadKindEnum,
  leaveStatusEnum,
  grievanceStatusEnum,
  grievanceUrgencyEnum,
} from './enums';

/**
 * FACULTY WORKLOAD ENGINE  (SIH-2026-13-012)
 * ---------------------------------------------------------------------------
 * Workload is computed from real scheduled activity (timetable entries,
 * assessments to grade, assigned duties) plus explicitly recorded items.
 * The engine never guesses: every hour in the total traces to a record here.
 */

export const workloadRecords = pgTable(
  'workload_records',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    facultyId: uuid('faculty_id')
      .notNull()
      .references(() => facultyProfiles.id, { onDelete: 'cascade' }),
    termId: uuid('term_id').references(() => terms.id, { onDelete: 'cascade' }),
    kind: workloadKindEnum('kind').notNull(),
    description: text('description').notNull(),
    /** Hours per week attributed to this item. */
    weeklyHours: numeric('weekly_hours', { precision: 5, scale: 2 }).notNull().default('0'),
    /** DERIVED items are recomputed from the timetable; MANUAL ones are entered. */
    source: text('source').notNull().default('MANUAL'),
    sourceType: text('source_type'),
    sourceId: uuid('source_id'),
    offeringId: uuid('offering_id').references(() => courseOfferings.id, { onDelete: 'cascade' }),
    effectiveFrom: date('effective_from'),
    effectiveTo: date('effective_to'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('workload_records_faculty_idx').on(t.facultyId, t.termId),
    index('workload_records_institution_idx').on(t.institutionId),
  ],
);

/** Cached workload rollup per faculty per term, with department comparison. */
export const workloadSummaries = pgTable(
  'workload_summaries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    facultyId: uuid('faculty_id')
      .notNull()
      .references(() => facultyProfiles.id, { onDelete: 'cascade' }),
    termId: uuid('term_id')
      .notNull()
      .references(() => terms.id, { onDelete: 'cascade' }),
    teachingHours: numeric('teaching_hours', { precision: 6, scale: 2 }).notNull().default('0'),
    labHours: numeric('lab_hours', { precision: 6, scale: 2 }).notNull().default('0'),
    assessmentHours: numeric('assessment_hours', { precision: 6, scale: 2 }).notNull().default('0'),
    administrativeHours: numeric('administrative_hours', { precision: 6, scale: 2 })
      .notNull()
      .default('0'),
    mentoringHours: numeric('mentoring_hours', { precision: 6, scale: 2 }).notNull().default('0'),
    otherHours: numeric('other_hours', { precision: 6, scale: 2 }).notNull().default('0'),
    totalHours: numeric('total_hours', { precision: 6, scale: 2 }).notNull().default('0'),
    departmentAverage: numeric('department_average', { precision: 6, scale: 2 }),
    /** BALANCED | HIGH | CRITICAL | UNDERLOADED */
    status: text('status').notNull().default('BALANCED'),
    /** Percentage of contracted maximum. */
    utilizationPercentage: numeric('utilization_percentage', { precision: 5, scale: 2 }),
    recomputedAt: timestamp('recomputed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('workload_summaries_uq').on(t.facultyId, t.termId),
    index('workload_summaries_status_idx').on(t.institutionId, t.status),
  ],
);

export const leaveRequests = pgTable(
  'leave_requests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    requesterId: uuid('requester_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    reference: text('reference').notNull(),
    /** CASUAL | MEDICAL | EARNED | DUTY | OTHER */
    leaveType: text('leave_type').notNull().default('CASUAL'),
    fromDate: date('from_date').notNull(),
    toDate: date('to_date').notNull(),
    isHalfDay: boolean('is_half_day').notNull().default(false),
    reason: text('reason').notNull(),
    status: leaveStatusEnum('status').notNull().default('PENDING'),
    /** Classes that need cover, computed at submission time. */
    affectedOfferingIds: jsonb('affected_offering_ids').$type<string[]>().default([]),
    affectedClassCount: integer('affected_class_count').notNull().default(0),
    /** Substitute arrangements agreed for the affected classes. */
    substitutePlan: jsonb('substitute_plan').$type<Record<string, unknown>[]>().default([]),
    reviewedById: uuid('reviewed_by_id').references(() => users.id, { onDelete: 'set null' }),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    reviewNote: text('review_note'),
    attachments: jsonb('attachments').$type<{ name: string; url: string }[]>().default([]),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('leave_requests_reference_uq').on(t.institutionId, t.reference),
    index('leave_requests_requester_idx').on(t.requesterId, t.status),
    index('leave_requests_status_idx').on(t.institutionId, t.status),
  ],
);

/**
 * REDRESSAL / GRIEVANCE CENTRE
 * ---------------------------------------------------------------------------
 * Structured issue resolution with SLA and escalation. Cases are NEVER hard
 * deleted — `withdrawnAt` / status CLOSED are the only terminal transitions,
 * and every state change is written to grievance_events.
 */

export const grievanceCategories = pgTable(
  'grievance_categories',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    description: text('description'),
    /** Which roles may raise this category. */
    availableToRoles: jsonb('available_to_roles').$type<string[]>().default(['STUDENT']),
    /** Default owning department for routing. */
    defaultDepartmentId: uuid('default_department_id').references(() => departments.id, {
      onDelete: 'set null',
    }),
    defaultAssigneeId: uuid('default_assignee_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    /** SLA in working hours. */
    responseSlaHours: integer('response_sla_hours').notNull().default(24),
    resolutionSlaHours: integer('resolution_sla_hours').notNull().default(72),
    escalationUserId: uuid('escalation_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    allowAnonymous: boolean('allow_anonymous').notNull().default(false),
    isSensitive: boolean('is_sensitive').notNull().default(false),
    isEnabled: boolean('is_enabled').notNull().default(true),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('grievance_categories_slug_uq').on(t.institutionId, t.slug)],
);

export const grievances = pgTable(
  'grievances',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    /** Human-facing case id, e.g. CASE-2026-004821. */
    caseNumber: text('case_number').notNull(),
    categoryId: uuid('category_id')
      .notNull()
      .references(() => grievanceCategories.id, { onDelete: 'restrict' }),

    /**
     * Anonymity: when `isAnonymous` is true the UI and every admin-facing query
     * must omit raiser identity. The column still exists (for audit and abuse
     * handling) but access is gated behind a dedicated permission that is not
     * granted to ordinary administrators. See GRIEVANCE.md §Anonymity.
     */
    raisedById: uuid('raised_by_id').references(() => users.id, { onDelete: 'set null' }),
    isAnonymous: boolean('is_anonymous').notNull().default(false),

    subject: text('subject').notNull(),
    description: text('description').notNull(),
    urgency: grievanceUrgencyEnum('urgency').notNull().default('NORMAL'),
    status: grievanceStatusEnum('status').notNull().default('SUBMITTED'),

    departmentId: uuid('department_id').references(() => departments.id, { onDelete: 'set null' }),
    assignedToId: uuid('assigned_to_id').references(() => users.id, { onDelete: 'set null' }),
    assignedAt: timestamp('assigned_at', { withTimezone: true }),

    /** SLA tracking. */
    responseDueAt: timestamp('response_due_at', { withTimezone: true }),
    resolutionDueAt: timestamp('resolution_due_at', { withTimezone: true }),
    firstResponseAt: timestamp('first_response_at', { withTimezone: true }),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    withdrawnAt: timestamp('withdrawn_at', { withTimezone: true }),
    escalationLevel: integer('escalation_level').notNull().default(0),
    lastEscalatedAt: timestamp('last_escalated_at', { withTimezone: true }),
    isSlaBreached: boolean('is_sla_breached').notNull().default(false),

    resolutionSummary: text('resolution_summary'),
    /** Satisfaction rating 1..5 captured on closure. */
    satisfactionRating: integer('satisfaction_rating'),

    /** Optional links to the record being disputed (e.g. an attendance record). */
    relatedEntityType: text('related_entity_type'),
    relatedEntityId: uuid('related_entity_id'),

    /** AI classification is advisory; routing rules make the final decision. */
    aiSuggestedCategoryId: uuid('ai_suggested_category_id'),
    aiSuggestedUrgency: grievanceUrgencyEnum('ai_suggested_urgency'),
    aiSummary: text('ai_summary'),

    attachments: jsonb('attachments').$type<{ name: string; url: string }[]>().default([]),
    preferredContactMethod: text('preferred_contact_method').default('IN_APP'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('grievances_case_uq').on(t.institutionId, t.caseNumber),
    index('grievances_status_idx').on(t.institutionId, t.status),
    index('grievances_assignee_idx').on(t.assignedToId, t.status),
    index('grievances_raiser_idx').on(t.raisedById),
    index('grievances_sla_idx').on(t.institutionId, t.resolutionDueAt),
  ],
);

export const grievanceMessages = pgTable(
  'grievance_messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    grievanceId: uuid('grievance_id')
      .notNull()
      .references(() => grievances.id, { onDelete: 'cascade' }),
    authorId: uuid('author_id').references(() => users.id, { onDelete: 'set null' }),
    body: text('body').notNull(),
    /** Internal notes are visible to handlers only, never to the raiser. */
    isInternalNote: boolean('is_internal_note').notNull().default(false),
    attachments: jsonb('attachments').$type<{ name: string; url: string }[]>().default([]),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('grievance_messages_grievance_idx').on(t.grievanceId, t.createdAt)],
);

/** Immutable state-transition log for a case. Nothing here is ever updated. */
export const grievanceEvents = pgTable(
  'grievance_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    grievanceId: uuid('grievance_id')
      .notNull()
      .references(() => grievances.id, { onDelete: 'cascade' }),
    /** CREATED | STATUS_CHANGED | ASSIGNED | ESCALATED | SLA_WARNING | SLA_BREACHED | ... */
    kind: text('kind').notNull(),
    fromValue: text('from_value'),
    toValue: text('to_value'),
    note: text('note'),
    actorId: uuid('actor_id').references(() => users.id, { onDelete: 'set null' }),
    /** True when the escalation engine (not a human) produced this event. */
    isSystemGenerated: boolean('is_system_generated').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('grievance_events_grievance_idx').on(t.grievanceId, t.createdAt)],
);
