import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  jsonb,
  index,
  uniqueIndex,
  bigint,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { institutions } from './tenancy';
import { users } from './people';
import { notifications } from './communication';
import {
  authTokenPurposeEnum,
  deliveryStatusEnum,
  fileScanStatusEnum,
  notificationChannelEnum,
} from './enums';

/**
 * PLATFORM FOUNDATION (CampusOS 2.0, Phase 1)
 * ---------------------------------------------------------------------------
 * Auth tokens, external identities, rate limiting, file storage metadata and
 * notification delivery tracking. Each is infrastructure that later modules
 * (events, clubs, library, billing) build on.
 */

/**
 * Out-of-band, single-use tokens: password reset, email verification, invites.
 * Only a SHA-256 hash of the token is stored; the raw token exists only in the
 * link that was emailed. `consumed_at` makes each token single-use.
 */
export const authTokens = pgTable(
  'auth_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    purpose: authTokenPurposeEnum('purpose').notNull(),
    tokenHash: text('token_hash').notNull(),
    /** The email the token was issued to — a later email change invalidates it. */
    sentTo: text('sent_to').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
    createdById: uuid('created_by_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('auth_tokens_hash_uq').on(t.tokenHash),
    index('auth_tokens_user_idx').on(t.userId, t.purpose),
  ],
);

/**
 * Links an external identity (Google, Microsoft, college SAML) to a user.
 * Architecture only in Phase 1 — no provider is wired yet. See docs/AUTH.md.
 */
export const authIdentities = pgTable(
  'auth_identities',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** 'google' | 'microsoft' | 'saml:<entity-id>' */
    provider: text('provider').notNull(),
    /** Stable subject identifier from the provider (never the email). */
    subject: text('subject').notNull(),
    email: text('email'),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('auth_identities_subject_uq').on(t.provider, t.subject),
    index('auth_identities_user_idx').on(t.userId),
  ],
);

/**
 * Fixed-window rate-limit counters, shared across app instances through the
 * database so limits hold on a multi-instance deployment without Redis.
 * Deliberately NOT tenant-scoped: limits apply to IPs and emails before a
 * tenant is known (login, registration, password reset).
 */
export const rateLimitBuckets = pgTable(
  'rate_limit_buckets',
  {
    key: text('key').primaryKey(),
    windowStart: timestamp('window_start', { withTimezone: true }).notNull(),
    count: integer('count').notNull().default(0),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (t) => [index('rate_limit_buckets_expiry_idx').on(t.expiresAt)],
);

/** Metadata for every stored object. The bytes live in the storage provider. */
export const storedFiles = pgTable(
  'stored_files',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    ownerId: uuid('owner_id').references(() => users.id, { onDelete: 'set null' }),
    /** RESOURCE | ANNOUNCEMENT | SUBMISSION | DATA_EXPORT | AVATAR | EVENT_COVER | CERTIFICATE */
    purpose: text('purpose').notNull(),
    provider: text('provider').notNull(),
    storageKey: text('storage_key').notNull(),
    originalName: text('original_name').notNull(),
    mimeType: text('mime_type').notNull(),
    sizeBytes: bigint('size_bytes', { mode: 'number' }).notNull(),
    sha256: text('sha256').notNull(),
    scanStatus: fileScanStatusEnum('scan_status').notNull().default('PENDING'),
    scanDetail: text('scan_detail'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('stored_files_key_uq').on(t.provider, t.storageKey),
    index('stored_files_owner_idx').on(t.institutionId, t.ownerId),
  ],
);

/**
 * One row per (notification or transactional message) × channel attempt.
 * In-app delivery is the `notifications` row itself; this table tracks the
 * external channels and — importantly — records WHY something was skipped.
 */
export const notificationDeliveries = pgTable(
  'notification_deliveries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    notificationId: uuid('notification_id').references(() => notifications.id, {
      onDelete: 'cascade',
    }),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
    channel: notificationChannelEnum('channel').notNull(),
    provider: text('provider'),
    /** e.g. 'password_reset' for transactional mail with no notification row. */
    template: text('template'),
    status: deliveryStatusEnum('status').notNull().default('QUEUED'),
    reason: text('reason'),
    providerMessageId: text('provider_message_id'),
    attempts: integer('attempts').notNull().default(0),
    lastError: text('last_error'),
    runAfter: timestamp('run_after', { withTimezone: true }).notNull().defaultNow(),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('notification_deliveries_queue_idx')
      .on(t.status, t.runAfter)
      .where(sql`status = 'QUEUED'`),
    index('notification_deliveries_user_idx').on(t.userId, t.createdAt),
    uniqueIndex('notification_deliveries_channel_uq')
      .on(t.notificationId, t.channel)
      .where(sql`notification_id IS NOT NULL`),
  ],
);

/** Push endpoints registered by a user's devices (FCM tokens / Web Push). */
export const pushSubscriptions = pgTable(
  'push_subscriptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** 'fcm' | 'webpush' */
    kind: text('kind').notNull(),
    token: text('token').notNull(),
    userAgent: text('user_agent'),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    meta: jsonb('meta').$type<Record<string, unknown>>().default({}),
  },
  (t) => [
    uniqueIndex('push_subscriptions_token_uq').on(t.kind, t.token),
    index('push_subscriptions_user_idx').on(t.userId),
  ],
);
