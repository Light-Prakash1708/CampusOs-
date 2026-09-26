import { pgTable, uuid, text, timestamp, index, uniqueIndex, jsonb } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { institutions, departments } from './tenancy';
import { users } from './people';

/**
 * OPPORTUNITIES (CampusOS Phase 9 — Career Mode)
 * ---------------------------------------------------------------------------
 * Internships, jobs, hackathons, competitions and scholarships — only ones a
 * real source put here: the college's placement cell, a student submission a
 * moderator approved, or an import from a feed the college configured (which
 * also waits for approval). CampusOS ships no listings of its own.
 *
 * `source` + `source_ref` make feed imports idempotent. Students keep their
 * own application tracker in `opportunity_tracking` (private to them).
 */

export const opportunities = pgTable(
  'opportunities',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    /** INTERNSHIP | JOB | HACKATHON | COMPETITION | SCHOLARSHIP | FELLOWSHIP */
    kind: text('kind').notNull(),
    title: text('title').notNull(),
    organization: text('organization').notNull(),
    description: text('description'),
    location: text('location'),
    /** ONSITE | REMOTE | HYBRID */
    workMode: text('work_mode').notNull().default('ONSITE'),
    /** Free text as the source states it ("₹15,000/month", "Unpaid", "₹1L prize pool"). */
    compensation: text('compensation'),
    applyUrl: text('apply_url'),
    deadline: timestamp('deadline', { withTimezone: true }),
    eligibility: text('eligibility'),
    skills: jsonb('skills').$type<string[]>().notNull().default([]),
    /** Optional audience: one department. Null = the whole college. */
    departmentId: uuid('department_id').references(() => departments.id, { onDelete: 'set null' }),
    /** PENDING → PUBLISHED | REJECTED; PUBLISHED → CLOSED */
    status: text('status').notNull().default('PENDING'),
    /** COLLEGE | STUDENT | FEED */
    source: text('source').notNull(),
    /** Feed name for FEED items (e.g. "json-feed"). */
    sourceName: text('source_name'),
    /** The item's id in the feed, for idempotent re-imports. */
    sourceRef: text('source_ref'),
    submittedById: uuid('submitted_by_id').references(() => users.id, { onDelete: 'set null' }),
    reviewedById: uuid('reviewed_by_id').references(() => users.id, { onDelete: 'set null' }),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    reviewNote: text('review_note'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('opportunities_inst_status_idx').on(t.institutionId, t.status, t.deadline),
    uniqueIndex('opportunities_source_ref_uq').on(t.institutionId, t.sourceName, t.sourceRef).where(sql`source_ref IS NOT NULL`),
  ],
);

/** A student's own application tracker. Never shown to anyone else. */
export const opportunityTracking = pgTable(
  'opportunity_tracking',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    opportunityId: uuid('opportunity_id')
      .notNull()
      .references(() => opportunities.id, { onDelete: 'cascade' }),
    /** SAVED | APPLIED | INTERVIEWING | OFFER | REJECTED | WITHDRAWN */
    status: text('status').notNull().default('SAVED'),
    note: text('note'),
    appliedAt: timestamp('applied_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('opportunity_tracking_uq').on(t.userId, t.opportunityId), index('opportunity_tracking_user_idx').on(t.userId, t.status)],
);
