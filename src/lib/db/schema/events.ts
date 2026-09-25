import { pgTable, uuid, text, timestamp, index, uniqueIndex, jsonb, integer } from 'drizzle-orm/pg-core';
import { institutions } from './tenancy';
import { users } from './people';
import { events, eventRegistrations } from './communication';
import { announcementPriorityEnum } from './enums';

/**
 * EVENTS 2.0 (CampusOS Phase 3)
 * ---------------------------------------------------------------------------
 * `events` and `event_registrations` (communication.ts) were extended rather
 * than duplicated. These tables add what discovery and participation need:
 * saves/follows, check-ins, certificates, organiser updates and reports.
 *
 * Tenancy: every row carries the EVENT's institution_id (the organiser's
 * college). For PUBLIC events a student of another college may appear as a
 * registrant; their own college is recorded in
 * event_registrations.attendee_institution_id.
 */

/** "Save" = follow: saved events send the organiser's updates to the student. */
export const eventSaves = pgTable(
  'event_saves',
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
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('event_saves_uq').on(t.eventId, t.userId), index('event_saves_user_idx').on(t.userId)],
);

/** One check-in per registration, ever (unique). Scanning twice is a no-op. */
export const eventCheckins = pgTable(
  'event_checkins',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    registrationId: uuid('registration_id')
      .notNull()
      .references(() => eventRegistrations.id, { onDelete: 'cascade' }),
    checkedInById: uuid('checked_in_by_id').references(() => users.id, { onDelete: 'set null' }),
    /** QR | CODE | MANUAL */
    method: text('method').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('event_checkins_registration_uq').on(t.registrationId),
    index('event_checkins_event_idx').on(t.eventId, t.createdAt),
  ],
);

/**
 * Participation certificates. `verification_code` is what the public
 * verification page looks up; it reveals only event, organiser, date and the
 * recipient's display name.
 */
export const eventCertificates = pgTable(
  'event_certificates',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    registrationId: uuid('registration_id')
      .notNull()
      .references(() => eventRegistrations.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    verificationCode: text('verification_code').notNull(),
    /** PARTICIPATION | WINNER | RUNNER_UP | VOLUNTEER | ORGANISER */
    kind: text('kind').notNull().default('PARTICIPATION'),
    /** Name printed on the certificate, frozen at issue. */
    recipientName: text('recipient_name').notNull(),
    issuedById: uuid('issued_by_id').references(() => users.id, { onDelete: 'set null' }),
    issuedAt: timestamp('issued_at', { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    revokedReason: text('revoked_reason'),
  },
  (t) => [
    uniqueIndex('event_certificates_code_uq').on(t.verificationCode),
    uniqueIndex('event_certificates_registration_uq').on(t.registrationId, t.kind),
    index('event_certificates_user_idx').on(t.userId, t.issuedAt),
  ],
);

/** Organiser updates to registrants and followers ("the WhatsApp replacement"). */
export const eventUpdates = pgTable(
  'event_updates',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    authorId: uuid('author_id').references(() => users.id, { onDelete: 'set null' }),
    /** REGISTRATION_OPEN | REMINDER | VENUE_CHANGED | TIME_CHANGED | RESULTS | EMERGENCY | CERTIFICATES | GENERAL */
    kind: text('kind').notNull(),
    title: text('title').notNull(),
    body: text('body'),
    priority: announcementPriorityEnum('priority').notNull().default('NORMAL'),
    /** REGISTERED (incl. waitlist) | FOLLOWERS (registrants + savers) */
    audience: text('audience').notNull().default('FOLLOWERS'),
    recipientCount: integer('recipient_count').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('event_updates_event_idx').on(t.eventId, t.createdAt)],
);

/** Abuse / accuracy reports from students. Reviewed by moderators. */
export const eventReports = pgTable(
  'event_reports',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    reporterId: uuid('reporter_id').references(() => users.id, { onDelete: 'set null' }),
    /** FAKE | SPAM | WRONG_DETAILS | INAPPROPRIATE | OTHER */
    reason: text('reason').notNull(),
    details: text('details'),
    /** OPEN | DISMISSED | ACTIONED */
    status: text('status').notNull().default('OPEN'),
    resolvedById: uuid('resolved_by_id').references(() => users.id, { onDelete: 'set null' }),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    meta: jsonb('meta').$type<Record<string, unknown>>().default({}),
  },
  (t) => [
    uniqueIndex('event_reports_once_uq').on(t.eventId, t.reporterId),
    index('event_reports_status_idx').on(t.institutionId, t.status),
  ],
);
