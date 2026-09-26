import { pgTable, uuid, text, timestamp, index, uniqueIndex, integer, boolean, jsonb } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { institutions, departments, programs } from './tenancy';
import { users } from './people';
import { sections } from './academics';
import { storedFiles } from './platform';

/**
 * VERIFIED MEMBERSHIP (Institution onboarding)
 * ---------------------------------------------------------------------------
 * A CampusOS student who signed up on their own (PERSONAL workspace) asks a
 * college to take them in. The request is evidence for a human decision — an
 * attached college ID and automated signals never grant membership by
 * themselves. On approval the student's *existing* account moves into the
 * college (services/membership.ts); no second account is created.
 *
 *   PENDING → UNDER_REVIEW → APPROVED | REJECTED
 *   PENDING | UNDER_REVIEW → WITHDRAWN (by the student) | EXPIRED (by the job)
 *
 * `institution_id` is the college being asked (its reviewers see the request);
 * `from_institution_id` is the student's personal workspace.
 */
export const membershipRequests = pgTable(
  'membership_requests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    fromInstitutionId: uuid('from_institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    status: text('status').notNull().default('PENDING'),
    departmentId: uuid('department_id').references(() => departments.id, { onDelete: 'set null' }),
    programId: uuid('program_id').references(() => programs.id, { onDelete: 'set null' }),
    sectionId: uuid('section_id').references(() => sections.id, { onDelete: 'set null' }),
    year: integer('year').notNull(),
    /** The college-issued student ID / roll number, as the student typed it (upper-cased). */
    rollNumber: text('roll_number').notNull(),
    /** Private VERIFICATION_ID file (owner-only; reviewers read it through the request). */
    documentFileId: uuid('document_file_id').references(() => storedFiles.id, { onDelete: 'set null' }),
    /** Non-authoritative checks shown to reviewers (email domain, roll number free, …). */
    signals: jsonb('signals').$type<Record<string, boolean | string | null>>().notNull().default({}),
    emailDomainMatch: boolean('email_domain_match').notNull().default(false),
    reviewStartedById: uuid('review_started_by_id').references(() => users.id, { onDelete: 'set null' }),
    decidedById: uuid('decided_by_id').references(() => users.id, { onDelete: 'set null' }),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    /** Rejection category (see REJECTION_REASONS in services/membership.ts). */
    decisionReason: text('decision_reason'),
    /** Short, plain-text note shown to the student. */
    decisionNote: text('decision_note'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // One open request per student, across all colleges.
    uniqueIndex('membership_requests_open_uq').on(t.userId).where(sql`status IN ('PENDING', 'UNDER_REVIEW')`),
    index('membership_requests_queue_idx').on(t.institutionId, t.status, t.createdAt),
    index('membership_requests_user_idx').on(t.userId, t.createdAt),
  ],
);
