import { pgTable, uuid, text, timestamp, index, uniqueIndex, integer, boolean } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { institutions, departments } from './tenancy';
import { users } from './people';
import { subjects } from './academics';
import { resources } from './resources';

/**
 * LIBRARY (CampusOS Phase 9)
 * ---------------------------------------------------------------------------
 * A physical-book catalogue with loans and a reservation queue, plus
 * per-student saved resources (notes, PYQs) on top of the existing Resource
 * Hub — which stays the single home for digital material (no duplicate table).
 *
 * Availability is derived, never stored: total_copies − active loans − copies
 * held for a READY reservation. Issuing locks the book row, so two desks can't
 * lend the last copy twice. Fines are computed from dates (policy in
 * services/library/rules.ts); CampusOS shows them but takes no payments.
 */

export const libraryBooks = pgTable(
  'library_books',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    authors: text('authors'),
    isbn: text('isbn'),
    publisher: text('publisher'),
    edition: text('edition'),
    publishedYear: integer('published_year'),
    departmentId: uuid('department_id').references(() => departments.id, { onDelete: 'set null' }),
    subjectId: uuid('subject_id').references(() => subjects.id, { onDelete: 'set null' }),
    /** Where to find it, e.g. "Central Library · Rack C-4". */
    shelf: text('shelf'),
    totalCopies: integer('total_copies').notNull().default(1),
    isActive: boolean('is_active').notNull().default(true),
    createdById: uuid('created_by_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('library_books_inst_idx').on(t.institutionId, t.isActive),
    uniqueIndex('library_books_isbn_uq').on(t.institutionId, t.isbn).where(sql`isbn IS NOT NULL`),
  ],
);

export const libraryLoans = pgTable(
  'library_loans',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    bookId: uuid('book_id')
      .notNull()
      .references(() => libraryBooks.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    issuedById: uuid('issued_by_id').references(() => users.id, { onDelete: 'set null' }),
    issuedAt: timestamp('issued_at', { withTimezone: true }).notNull().defaultNow(),
    dueAt: timestamp('due_at', { withTimezone: true }).notNull(),
    renewals: integer('renewals').notNull().default(0),
    returnedAt: timestamp('returned_at', { withTimezone: true }),
    returnedToId: uuid('returned_to_id').references(() => users.id, { onDelete: 'set null' }),
    /** Staff may waive a fine; the reason is audited. */
    fineWaived: boolean('fine_waived').notNull().default(false),
  },
  (t) => [
    index('library_loans_user_idx').on(t.userId, t.returnedAt),
    index('library_loans_book_idx').on(t.bookId, t.returnedAt),
    // One open loan of the same title per person.
    uniqueIndex('library_loans_open_uq').on(t.bookId, t.userId).where(sql`returned_at IS NULL`),
  ],
);

export const libraryReservations = pgTable(
  'library_reservations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    bookId: uuid('book_id')
      .notNull()
      .references(() => libraryBooks.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** WAITING → READY (a copy is held) → FULFILLED (issued) | EXPIRED | CANCELLED */
    status: text('status').notNull().default('WAITING'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    readyAt: timestamp('ready_at', { withTimezone: true }),
    readyUntil: timestamp('ready_until', { withTimezone: true }),
    closedAt: timestamp('closed_at', { withTimezone: true }),
  },
  (t) => [
    index('library_reservations_book_idx').on(t.bookId, t.status, t.createdAt),
    index('library_reservations_user_idx').on(t.userId, t.status),
    uniqueIndex('library_reservations_open_uq').on(t.bookId, t.userId).where(sql`status IN ('WAITING', 'READY')`),
  ],
);

/** A student's bookmarks on Resource Hub items (notes, PYQs, slides …). */
export const resourceSaves = pgTable(
  'resource_saves',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    resourceId: uuid('resource_id')
      .notNull()
      .references(() => resources.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('resource_saves_uq').on(t.userId, t.resourceId)],
);
