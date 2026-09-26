import { pgTable, uuid, text, timestamp, jsonb, date, index, primaryKey, uniqueIndex } from 'drizzle-orm/pg-core';
import { institutions } from './tenancy';

/**
 * PRODUCT ANALYTICS (CAMPUSOS-003)
 * ---------------------------------------------------------------------------
 * The product's learning system. Privacy rules, enforced in
 * src/services/product-events.ts:
 *   - no user id, name, email, IP or free text is ever stored;
 *   - the actor is a keyed HMAC of the user id (`actor_hash`), stable across
 *     tenants so retention survives a personal → college transfer;
 *   - event names and property keys/values come from an allowlist;
 *   - rows are purged after ANALYTICS_RETENTION_DAYS by the jobs sweep.
 * Only platform operators can read aggregates. See docs/ANALYTICS.md.
 */
export const productEvents = pgTable(
  'product_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    actorHash: text('actor_hash').notNull(),
    /** STUDENT | FACULTY | ADMIN | … — coarse role, never an identifier. */
    role: text('role').notNull(),
    event: text('event').notNull(),
    props: jsonb('props').$type<Record<string, string | number | boolean>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('product_events_event_time_idx').on(t.event, t.createdAt),
    index('product_events_tenant_time_idx').on(t.institutionId, t.createdAt),
    index('product_events_actor_time_idx').on(t.actorHash, t.createdAt),
  ],
);

/**
 * One row per actor per day they used a portal. Powers DAU/WAU/MAU and
 * cohort retention without logging page views.
 */
export const productActiveDays = pgTable(
  'product_active_days',
  {
    actorHash: text('actor_hash').notNull(),
    day: date('day').notNull(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    role: text('role').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.actorHash, t.day] }),
    index('product_active_days_day_idx').on(t.day),
    index('product_active_days_tenant_idx').on(t.institutionId, t.day),
  ],
);

/**
 * CAMPUS DEMAND (CAMPUSOS-012). A personal-workspace student names the
 * college they attend when it isn't on CampusOS yet. One row per student
 * (latest answer wins); operators only ever see counts per college, and only
 * above a threshold. `institution_id` is the student's own workspace, so the
 * row disappears with it; it is also removed once they are verified.
 */
export const campusInterest = pgTable(
  'campus_interest',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    actorHash: text('actor_hash').notNull(),
    collegeKey: text('college_key').notNull(),
    displayName: text('display_name').notNull(),
    city: text('city'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('campus_interest_actor_uq').on(t.actorHash), index('campus_interest_key_idx').on(t.collegeKey)],
);
