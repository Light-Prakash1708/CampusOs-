import { pgTable, uuid, text, timestamp, index, uniqueIndex, integer, date, boolean } from 'drizzle-orm/pg-core';
import { institutions } from './tenancy';
import { users } from './people';

/**
 * PERSONAL TRACKER + GAMIFICATION (CampusOS Phase 8)
 * ---------------------------------------------------------------------------
 * Tracker rows (goals, steps, check-ins, tasks) belong to the student alone.
 * They are PRIVATE by construction: no staff screen reads them, they are not
 * audited (an audit trail of someone's habits is itself a privacy leak), and
 * they are erased immediately on request (PERSONAL_TRACKER_ERASERS).
 *
 * Dates are the student's *local* calendar date in the institution's
 * timezone (`local_date`), computed server-side, so a check-in at 00:30 IST
 * counts for the right day and streaks never break at UTC midnight.
 *
 * XP is an append-only ledger (`xp_events`, UPDATE is blocked by a trigger).
 * Every award has an idempotency key unique per user, so a retried request
 * or a re-run backfill can never award twice. Reversals are new negative
 * rows. Leaderboards sum only `verified` rows — XP from activity CampusOS
 * can confirm (event check-ins, certificates). Self-reported tracker XP is
 * shown to the student but never ranks them against anyone.
 */

export const trackerGoals = pgTable(
  'tracker_goals',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    description: text('description'),
    /** STUDY | SKILL | HEALTH | READING | CAREER | PERSONAL */
    category: text('category').notNull().default('PERSONAL'),
    /** DAILY (habit) | WEEKLY (n days a week) | ONCE (milestone with steps) */
    cadence: text('cadence').notNull().default('DAILY'),
    /** DAILY: check-ins per day. WEEKLY: days per week. ONCE: unused (1). */
    targetPerPeriod: integer('target_per_period').notNull().default(1),
    /** Optional unit for the amount logged with a check-in, e.g. "minutes". */
    unit: text('unit'),
    startDate: date('start_date').notNull(),
    targetDate: date('target_date'),
    /** ACTIVE | PAUSED | COMPLETED | ARCHIVED */
    status: text('status').notNull().default('ACTIVE'),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('tracker_goals_user_idx').on(t.userId, t.status)],
);

/** Checklist steps for a goal (mainly ONCE goals: "finish the SQL course"). */
export const trackerGoalSteps = pgTable(
  'tracker_goal_steps',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    goalId: uuid('goal_id')
      .notNull()
      .references(() => trackerGoals.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    position: integer('position').notNull().default(0),
    doneAt: timestamp('done_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('tracker_goal_steps_goal_idx').on(t.goalId, t.position)],
);

/**
 * One row per goal per local day. `count` increments for goals checked in
 * several times a day; `amount` sums the optional quantity (minutes, pages).
 */
export const trackerCheckins = pgTable(
  'tracker_checkins',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    goalId: uuid('goal_id')
      .notNull()
      .references(() => trackerGoals.id, { onDelete: 'cascade' }),
    localDate: date('local_date').notNull(),
    count: integer('count').notNull().default(1),
    amount: integer('amount'),
    note: text('note'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('tracker_checkins_goal_day_uq').on(t.goalId, t.localDate),
    index('tracker_checkins_user_day_idx').on(t.userId, t.localDate),
  ],
);

/** Simple personal to-dos, optionally attached to a goal. */
export const trackerTasks = pgTable(
  'tracker_tasks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    goalId: uuid('goal_id').references(() => trackerGoals.id, { onDelete: 'set null' }),
    title: text('title').notNull(),
    dueDate: date('due_date'),
    doneAt: timestamp('done_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('tracker_tasks_user_idx').on(t.userId, t.doneAt, t.dueDate)],
);

/** Append-only XP ledger. See the file header for the rules. */
export const xpEvents = pgTable(
  'xp_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** The STUDENT's institution (not the event organiser's). */
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    amount: integer('amount').notNull(),
    /** EVENT_ATTENDED | CERTIFICATE_EARNED | GOAL_CHECKIN | GOAL_COMPLETED | STREAK_MILESTONE | REVERSAL */
    source: text('source').notNull(),
    /** true = confirmed by CampusOS (counts on leaderboards). */
    verified: boolean('verified').notNull().default(false),
    reason: text('reason').notNull(),
    refId: uuid('ref_id'),
    idempotencyKey: text('idempotency_key').notNull(),
    localDate: date('local_date').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('xp_events_idempotency_uq').on(t.userId, t.idempotencyKey),
    index('xp_events_user_idx').on(t.userId, t.createdAt),
    index('xp_events_board_idx').on(t.institutionId, t.verified, t.localDate),
  ],
);

/** Badges a student has earned. Definitions live in code (services/gamification/rules.ts). */
export const userAchievements = pgTable(
  'user_achievements',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    code: text('code').notNull(),
    earnedAt: timestamp('earned_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('user_achievements_uq').on(t.userId, t.code)],
);
