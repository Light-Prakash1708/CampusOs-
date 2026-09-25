import { sql } from 'drizzle-orm';
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
import { institutions, campuses, departments, programs } from './tenancy';
import { users } from './people';
import { sections, courseOfferings, rooms } from './academics';
import {
  announcementCategoryEnum,
  announcementPriorityEnum,
  announcementKindEnum,
  announcementStatusEnum,
  audienceScopeEnum,
  notificationChannelEnum,
  changeKindEnum,
  eventStatusEnum,
} from './enums';

/**
 * COMMUNICATION — the single source of truth layer
 * ---------------------------------------------------------------------------
 * An announcement is not a message board post. It is an addressed institutional
 * record with: an audience computed from the academic hierarchy, an optional
 * acknowledgement requirement, an approval gate, an expiry, and a full audit
 * trail. `announcement_targets` holds the *rules*; `announcement_recipients`
 * holds the *resolved* set of users, computed once at publish time so that
 * read-tracking is exact and cheap to query.
 */

export const announcements = pgTable(
  'announcements',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    /** Human-facing reference, e.g. "NOTICE-2026-00184". */
    reference: text('reference').notNull(),
    title: text('title').notNull(),
    body: text('body').notNull(),
    /** Short plain-text summary used in notification lists and digests. */
    summary: text('summary'),

    authorId: uuid('author_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    departmentId: uuid('department_id').references(() => departments.id, { onDelete: 'set null' }),

    kind: announcementKindEnum('kind').notNull().default('INFORMATIONAL'),
    category: announcementCategoryEnum('category').notNull().default('GENERAL'),
    priority: announcementPriorityEnum('priority').notNull().default('NORMAL'),
    status: announcementStatusEnum('status').notNull().default('DRAFT'),

    /** Acknowledgement turns "I didn't know" into a measurable number. */
    requiresAcknowledgement: boolean('requires_acknowledgement').notNull().default(false),
    acknowledgementDeadline: timestamp('acknowledgement_deadline', { withTimezone: true }),
    /** OFFICIAL announcements from non-authorised roles must be approved first. */
    requiresApproval: boolean('requires_approval').notNull().default(false),
    approvedById: uuid('approved_by_id').references(() => users.id, { onDelete: 'set null' }),
    approvedAt: timestamp('approved_at', { withTimezone: true }),

    publishAt: timestamp('publish_at', { withTimezone: true }),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }),

    attachments: jsonb('attachments').$type<{ name: string; url: string; size?: number }[]>()
      .default([]),
    /** Optional links to the thing this announcement is about. */
    relatedEventId: uuid('related_event_id'),
    relatedOfferingId: uuid('related_offering_id').references(() => courseOfferings.id, {
      onDelete: 'set null',
    }),

    /** Controlled discussion; admins can close it to prevent WhatsApp-style chaos. */
    allowComments: boolean('allow_comments').notNull().default(false),
    commentsClosedAt: timestamp('comments_closed_at', { withTimezone: true }),

    /** Emergency broadcasts bypass quiet hours and notification preferences. */
    isEmergencyBroadcast: boolean('is_emergency_broadcast').notNull().default(false),

    /** Resolved audience size, filled at publish time. */
    recipientCount: integer('recipient_count').notNull().default(0),
    acknowledgedCount: integer('acknowledged_count').notNull().default(0),
    readCount: integer('read_count').notNull().default(0),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('announcements_reference_uq').on(t.institutionId, t.reference),
    index('announcements_institution_status_idx').on(t.institutionId, t.status),
    index('announcements_published_idx').on(t.institutionId, t.publishedAt),
    index('announcements_author_idx').on(t.authorId),
  ],
);

/** Targeting *rules*. Multiple rows are unioned to form the audience. */
export const announcementTargets = pgTable(
  'announcement_targets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    announcementId: uuid('announcement_id')
      .notNull()
      .references(() => announcements.id, { onDelete: 'cascade' }),
    scope: audienceScopeEnum('scope').notNull(),
    campusId: uuid('campus_id').references(() => campuses.id, { onDelete: 'cascade' }),
    departmentId: uuid('department_id').references(() => departments.id, { onDelete: 'cascade' }),
    programId: uuid('program_id').references(() => programs.id, { onDelete: 'cascade' }),
    sectionId: uuid('section_id').references(() => sections.id, { onDelete: 'cascade' }),
    offeringId: uuid('offering_id').references(() => courseOfferings.id, { onDelete: 'cascade' }),
    year: integer('year'),
    /** For ROLE scope: which role this rule addresses. */
    role: text('role'),
    /** For USER scope: a specific person. */
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
    /** Excludes rather than includes — lets you say "all of BBA except Section C". */
    isExclusion: boolean('is_exclusion').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('announcement_targets_announcement_idx').on(t.announcementId)],
);

/** Resolved audience + per-user read/ack state. One row per recipient. */
export const announcementRecipients = pgTable(
  'announcement_recipients',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    announcementId: uuid('announcement_id')
      .notNull()
      .references(() => announcements.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    readAt: timestamp('read_at', { withTimezone: true }),
    acknowledgedAt: timestamp('acknowledged_at', { withTimezone: true }),
    /** Which rule brought this user in — shown in "why am I seeing this?". */
    matchedScope: audienceScopeEnum('matched_scope'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('announcement_recipients_uq').on(t.announcementId, t.userId),
    index('announcement_recipients_user_idx').on(t.userId, t.readAt),
    index('announcement_recipients_ack_idx').on(t.announcementId, t.acknowledgedAt),
  ],
);

export const announcementComments = pgTable(
  'announcement_comments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    announcementId: uuid('announcement_id')
      .notNull()
      .references(() => announcements.id, { onDelete: 'cascade' }),
    authorId: uuid('author_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    body: text('body').notNull(),
    /** Official answers are pinned above the rest. */
    isOfficialResponse: boolean('is_official_response').notNull().default(false),
    parentId: uuid('parent_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [index('announcement_comments_announcement_idx').on(t.announcementId)],
);

/**
 * NOTIFICATIONS
 * Grouped by `groupKey` so the UI can show "5 Academic Updates" instead of 5 rows.
 */
export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    body: text('body'),
    priority: announcementPriorityEnum('priority').notNull().default('NORMAL'),
    category: announcementCategoryEnum('category').notNull().default('GENERAL'),
    /** Deep link into the app. */
    actionUrl: text('action_url'),
    /** Collapses related notifications in the UI, e.g. "timetable:2026-08-20". */
    groupKey: text('group_key'),
    /** Source record, for traceability. */
    sourceType: text('source_type'),
    sourceId: uuid('source_id'),
    readAt: timestamp('read_at', { withTimezone: true }),
    /** Mandatory notices cannot be suppressed by user preferences. */
    isMandatory: boolean('is_mandatory').notNull().default(false),
    deliveredChannels: jsonb('delivered_channels').$type<string[]>().default([]),
    /**
     * Set once the delivery planner has decided which external channels (email,
     * push, SMS, WhatsApp) this notification goes to. Null = not yet planned.
     * Planning is done by the job runner so every insert site is covered.
     */
    deliveryPlannedAt: timestamp('delivery_planned_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('notifications_user_idx').on(t.userId, t.readAt),
    index('notifications_unplanned_idx')
      .on(t.createdAt)
      .where(sql`delivery_planned_at IS NULL`),
    index('notifications_group_idx').on(t.userId, t.groupKey),
    index('notifications_created_idx').on(t.userId, t.createdAt),
  ],
);

export const notificationPreferences = pgTable(
  'notification_preferences',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    category: announcementCategoryEnum('category').notNull(),
    channel: notificationChannelEnum('channel').notNull(),
    enabled: boolean('enabled').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('notification_preferences_uq').on(t.userId, t.category, t.channel)],
);

/** Quiet hours + global channel switches, one row per user. */
export const notificationSettings = pgTable(
  'notification_settings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    quietHoursEnabled: boolean('quiet_hours_enabled').notNull().default(false),
    quietHoursStart: text('quiet_hours_start').default('22:00'),
    quietHoursEnd: text('quiet_hours_end').default('07:00'),
    emailEnabled: boolean('email_enabled').notNull().default(true),
    pushEnabled: boolean('push_enabled').notNull().default(true),
    smsEnabled: boolean('sms_enabled').notNull().default(false),
    digestEnabled: boolean('digest_enabled').notNull().default(true),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('notification_settings_uq').on(t.userId)],
);

/**
 * CHANGE FEED — "What changed?"
 * Every mutation that affects people's plans writes a row here with a
 * before/after payload, a reason, and who approved it. This is what powers
 * both the campus change feed and the "why did this change?" AI answer.
 */
export const changeEvents = pgTable(
  'change_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    kind: changeKindEnum('kind').notNull(),
    title: text('title').notNull(),
    /** Human-readable, e.g. "Room 204 → Room 302". */
    summary: text('summary').notNull(),
    beforeValue: jsonb('before_value').$type<Record<string, unknown>>(),
    afterValue: jsonb('after_value').$type<Record<string, unknown>>(),
    reason: text('reason'),
    entityType: text('entity_type').notNull(),
    entityId: uuid('entity_id'),
    changedById: uuid('changed_by_id').references(() => users.id, { onDelete: 'set null' }),
    approvedById: uuid('approved_by_id').references(() => users.id, { onDelete: 'set null' }),
    /** Denormalised audience for fast "changes that affect me" queries. */
    affectedSectionIds: jsonb('affected_section_ids').$type<string[]>().default([]),
    affectedUserIds: jsonb('affected_user_ids').$type<string[]>().default([]),
    affectedCount: integer('affected_count').notNull().default(0),
    effectiveFrom: timestamp('effective_from', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('change_events_institution_idx').on(t.institutionId, t.createdAt),
    index('change_events_entity_idx').on(t.entityType, t.entityId),
    index('change_events_kind_idx').on(t.institutionId, t.kind),
  ],
);

/** Institutional events — conflict-checked against classes, exams and rooms. */
export const events = pgTable(
  'events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    description: text('description'),
    organizerId: uuid('organizer_id').references(() => users.id, { onDelete: 'set null' }),
    departmentId: uuid('department_id').references(() => departments.id, { onDelete: 'set null' }),
    roomId: uuid('room_id').references(() => rooms.id, { onDelete: 'set null' }),
    venueText: text('venue_text'),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
    capacity: integer('capacity'),
    registrationRequired: boolean('registration_required').notNull().default(false),
    registrationDeadline: timestamp('registration_deadline', { withTimezone: true }),
    speaker: text('speaker'),
    status: eventStatusEnum('status').notNull().default('DRAFT'),
    /** Does this event displace scheduled classes? Drives conflict severity. */
    blocksClasses: boolean('blocks_classes').notNull().default(false),
    attachments: jsonb('attachments').$type<{ name: string; url: string }[]>().default([]),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    index('events_institution_idx').on(t.institutionId, t.startsAt),
    index('events_room_idx').on(t.roomId, t.startsAt),
  ],
);

export const eventRegistrations = pgTable(
  'event_registrations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    registeredAt: timestamp('registered_at', { withTimezone: true }).notNull().defaultNow(),
    attendedAt: timestamp('attended_at', { withTimezone: true }),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
  },
  (t) => [uniqueIndex('event_registrations_uq').on(t.eventId, t.userId)],
);
