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
import { institutions, terms } from './tenancy';
import { users, studentProfiles, facultyProfiles } from './people';
import { courseOfferings, rooms, sections, subjects } from './academics';
import {
  assignmentStatusEnum,
  submissionStatusEnum,
  assessmentKindEnum,
  timetableStatusEnum,
} from './enums';

/**
 * ASSIGNMENTS & ASSESSMENTS
 * ---------------------------------------------------------------------------
 * AI may suggest a score and explain its reasoning, but `aiSuggestedScore` and
 * `score` are separate columns and only a human write sets `score`. This is a
 * product rule, enforced in the service layer and asserted in tests.
 */

export const assignments = pgTable(
  'assignments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    offeringId: uuid('offering_id')
      .notNull()
      .references(() => courseOfferings.id, { onDelete: 'cascade' }),
    createdById: uuid('created_by_id').references(() => facultyProfiles.id, {
      onDelete: 'set null',
    }),
    title: text('title').notNull(),
    instructions: text('instructions'),
    maxScore: numeric('max_score', { precision: 6, scale: 2 }).notNull().default('100'),
    weightPercentage: numeric('weight_percentage', { precision: 5, scale: 2 }),
    /** Rubric rows: [{ criterion, maxScore, descriptor }] */
    rubric: jsonb('rubric')
      .$type<{ criterion: string; maxScore: number; descriptor?: string }[]>()
      .default([]),
    /** Skills this assignment evidences — feeds the student skill graph. */
    skillTags: jsonb('skill_tags').$type<string[]>().default([]),
    dueAt: timestamp('due_at', { withTimezone: true }),
    /** Deadline changes are recorded in the change feed, never silently applied. */
    originalDueAt: timestamp('original_due_at', { withTimezone: true }),
    allowLateSubmission: boolean('allow_late_submission').notNull().default(true),
    latePenaltyPercentage: numeric('late_penalty_percentage', { precision: 5, scale: 2 }).default(
      '0',
    ),
    status: assignmentStatusEnum('status').notNull().default('DRAFT'),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    attachments: jsonb('attachments').$type<{ name: string; url: string; size?: number }[]>()
      .default([]),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    index('assignments_institution_idx').on(t.institutionId),
    index('assignments_offering_idx').on(t.offeringId, t.status),
    index('assignments_due_idx').on(t.institutionId, t.dueAt),
  ],
);

export const submissions = pgTable(
  'submissions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    assignmentId: uuid('assignment_id')
      .notNull()
      .references(() => assignments.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id')
      .notNull()
      .references(() => studentProfiles.id, { onDelete: 'cascade' }),
    status: submissionStatusEnum('status').notNull().default('NOT_SUBMITTED'),
    submittedAt: timestamp('submitted_at', { withTimezone: true }),
    content: text('content'),
    attachments: jsonb('attachments').$type<{ name: string; url: string; size?: number }[]>()
      .default([]),
    attemptNumber: integer('attempt_number').notNull().default(1),

    /** --- Human grading (authoritative) --- */
    score: numeric('score', { precision: 6, scale: 2 }),
    feedback: text('feedback'),
    rubricScores: jsonb('rubric_scores').$type<Record<string, number>>(),
    evaluatedById: uuid('evaluated_by_id').references(() => users.id, { onDelete: 'set null' }),
    evaluatedAt: timestamp('evaluated_at', { withTimezone: true }),

    /** --- AI assistance (advisory only, never authoritative) --- */
    aiSuggestedScore: numeric('ai_suggested_score', { precision: 6, scale: 2 }),
    aiFeedback: text('ai_feedback'),
    aiRubricScores: jsonb('ai_rubric_scores').$type<Record<string, number>>(),
    aiAnalysedAt: timestamp('ai_analysed_at', { withTimezone: true }),
    /** True once a human has reviewed the AI suggestion (accepted or overridden). */
    aiSuggestionReviewed: boolean('ai_suggestion_reviewed').notNull().default(false),
    /** Similarity signal for integrity review — surfaced to faculty, never auto-punitive. */
    similarityScore: numeric('similarity_score', { precision: 5, scale: 2 }),
    similarityNotes: text('similarity_notes'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('submissions_uq').on(t.assignmentId, t.studentId, t.attemptNumber),
    index('submissions_student_idx').on(t.studentId),
    index('submissions_assignment_idx').on(t.assignmentId, t.status),
  ],
);

/** Exams / internal assessments. Scheduling passes through the conflict engine. */
export const assessments = pgTable(
  'assessments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    termId: uuid('term_id')
      .notNull()
      .references(() => terms.id, { onDelete: 'cascade' }),
    subjectId: uuid('subject_id').references(() => subjects.id, { onDelete: 'set null' }),
    offeringId: uuid('offering_id').references(() => courseOfferings.id, { onDelete: 'cascade' }),
    kind: assessmentKindEnum('kind').notNull().default('INTERNAL'),
    title: text('title').notNull(),
    maxScore: numeric('max_score', { precision: 6, scale: 2 }).notNull().default('100'),
    date: date('date'),
    startsAt: timestamp('starts_at', { withTimezone: true }),
    endsAt: timestamp('ends_at', { withTimezone: true }),
    durationMinutes: integer('duration_minutes').default(120),
    status: timetableStatusEnum('status').notNull().default('DRAFT'),
    instructions: text('instructions'),
    createdById: uuid('created_by_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    index('assessments_institution_idx').on(t.institutionId),
    index('assessments_term_idx').on(t.termId),
    index('assessments_date_idx').on(t.institutionId, t.date),
  ],
);

/** Room + invigilator allocation for an exam. Conflict-checked on write. */
export const assessmentAllocations = pgTable(
  'assessment_allocations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    assessmentId: uuid('assessment_id')
      .notNull()
      .references(() => assessments.id, { onDelete: 'cascade' }),
    roomId: uuid('room_id').references(() => rooms.id, { onDelete: 'set null' }),
    sectionId: uuid('section_id').references(() => sections.id, { onDelete: 'set null' }),
    invigilatorId: uuid('invigilator_id').references(() => facultyProfiles.id, {
      onDelete: 'set null',
    }),
    seatCount: integer('seat_count').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('assessment_allocations_assessment_idx').on(t.assessmentId),
    index('assessment_allocations_room_idx').on(t.roomId),
    index('assessment_allocations_invigilator_idx').on(t.invigilatorId),
  ],
);

export const assessmentResults = pgTable(
  'assessment_results',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    assessmentId: uuid('assessment_id')
      .notNull()
      .references(() => assessments.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id')
      .notNull()
      .references(() => studentProfiles.id, { onDelete: 'cascade' }),
    score: numeric('score', { precision: 6, scale: 2 }),
    grade: text('grade'),
    isAbsent: boolean('is_absent').notNull().default(false),
    remarks: text('remarks'),
    recordedById: uuid('recorded_by_id').references(() => users.id, { onDelete: 'set null' }),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('assessment_results_uq').on(t.assessmentId, t.studentId),
    index('assessment_results_student_idx').on(t.studentId),
  ],
);
