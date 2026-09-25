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
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { institutions } from './tenancy';
import { users } from './people';
import { storedFiles } from './platform';
import { dataRequestStatusEnum, leaderboardVisibilityEnum } from './enums';

/**
 * PRIVACY & DATA GOVERNANCE (CampusOS 2.0)
 * ---------------------------------------------------------------------------
 * Shaped around India's Digital Personal Data Protection Act, 2023: the
 * institution is the Data Fiduciary for academic records; the student is the
 * Data Principal with rights to access (export), correction and erasure of
 * data not under a legal retention obligation. See docs/PRIVACY.md.
 *
 * Defaults are privacy-protective: nothing optional is public until the
 * student turns it on.
 */

/** One row per user. Absence of a row means "all defaults" (see PRIVACY_DEFAULTS). */
export const privacyPreferences = pgTable(
  'privacy_preferences',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    leaderboardVisibility: leaderboardVisibilityEnum('leaderboard_visibility')
      .notNull()
      .default('PRIVATE'),
    /** Who can see the profile page: INSTITUTION | PRIVATE */
    profileVisibility: text('profile_visibility').notNull().default('INSTITUTION'),
    showStreaks: boolean('show_streaks').notNull().default(false),
    showAchievements: boolean('show_achievements').notNull().default(true),
    showEventParticipation: boolean('show_event_participation').notNull().default(false),
    personalizedRecommendations: boolean('personalized_recommendations').notNull().default(true),
    /** Optional AI memory (Phase 6). Off unless the student turns it on. */
    aiMemoryEnabled: boolean('ai_memory_enabled').notNull().default(false),
    /** Which data scopes the AI Coach may read. Empty = none beyond the assistant defaults. */
    aiCoachScopes: jsonb('ai_coach_scopes').$type<string[]>().notNull().default([]),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('privacy_preferences_user_uq').on(t.userId)],
);

/**
 * Consent ledger — append-only (enforced by trigger). Every grant or
 * withdrawal is a new row; the current state is the latest row per purpose.
 */
export const consentRecords = pgTable(
  'consent_records',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** e.g. 'personalized_recommendations', 'ai_memory', 'leaderboard_public' */
    purpose: text('purpose').notNull(),
    granted: boolean('granted').notNull(),
    /** Version of the notice the user saw when deciding. */
    noticeVersion: text('notice_version').notNull(),
    /** 'privacy_center' | 'onboarding' | 'api' */
    source: text('source').notNull(),
    ipAddress: text('ip_address'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('consent_records_user_idx').on(t.userId, t.purpose, t.createdAt)],
);

/**
 * Per-tenant retention policy per data category. Seeded from the catalogue in
 * src/services/privacy/catalogue.ts; institutions may tighten them.
 */
export const dataRetentionPolicies = pgTable(
  'data_retention_policies',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    category: text('category').notNull(),
    purpose: text('purpose').notNull(),
    owner: text('owner').notNull(),
    /** Null = retained while the account exists. */
    retentionDays: integer('retention_days'),
    visibility: text('visibility').notNull(),
    deletionPolicy: text('deletion_policy').notNull(),
    exportPolicy: text('export_policy').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('data_retention_policies_uq').on(t.institutionId, t.category)],
);

/** A student's request for a copy of their data. */
export const dataExportRequests = pgTable(
  'data_export_requests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    status: dataRequestStatusEnum('status').notNull().default('PENDING'),
    fileId: uuid('file_id').references(() => storedFiles.id, { onDelete: 'set null' }),
    /** Categories included, for the record. */
    categories: jsonb('categories').$type<string[]>().notNull().default([]),
    error: text('error'),
    requestedAt: timestamp('requested_at', { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
  },
  (t) => [
    index('data_export_requests_user_idx').on(t.userId, t.requestedAt),
    // At most one in-flight export per user.
    uniqueIndex('data_export_requests_inflight_uq')
      .on(t.userId)
      .where(sql`status IN ('PENDING','PROCESSING')`),
  ],
);

/**
 * Erasure requests. Personal-tracker data is deleted immediately on request;
 * account deletion is reviewed by the institution because some academic
 * records carry statutory retention obligations.
 */
export const dataDeletionRequests = pgTable(
  'data_deletion_requests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** 'ACCOUNT' | 'PERSONAL_TRACKER' | 'AI_MEMORY' */
    scope: text('scope').notNull(),
    reason: text('reason'),
    status: dataRequestStatusEnum('status').notNull().default('PENDING'),
    decidedById: uuid('decided_by_id').references(() => users.id, { onDelete: 'set null' }),
    decisionNote: text('decision_note'),
    requestedAt: timestamp('requested_at', { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (t) => [
    index('data_deletion_requests_status_idx').on(t.institutionId, t.status),
    uniqueIndex('data_deletion_requests_inflight_uq')
      .on(t.userId, t.scope)
      .where(sql`status IN ('PENDING','PROCESSING')`),
  ],
);
