import { pgTable, uuid, text, timestamp, integer, uniqueIndex } from 'drizzle-orm/pg-core';
import { institutions } from './tenancy';
import { users } from './people';

/**
 * TOOL USAGE (CampusOS Phase 1 — Tools & Utilities hub)
 * ---------------------------------------------------------------------------
 * How often a student opens each tool, so the hub can put their most-used
 * tools first instead of a fixed order. One row per (user, tool): a counter,
 * not an event log — it cannot reconstruct *when* someone did what beyond the
 * last open. Private to the student: no staff screen reads it; it is included
 * in the personal data export and removed on account deletion.
 *
 * `tool_key` is validated in the service against the code registry
 * (src/lib/tools.ts); unknown keys are refused.
 */
export const toolUsage = pgTable(
  'tool_usage',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    toolKey: text('tool_key').notNull(),
    openCount: integer('open_count').notNull().default(1),
    lastOpenedAt: timestamp('last_opened_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('tool_usage_user_tool_uq').on(t.userId, t.toolKey)],
);
