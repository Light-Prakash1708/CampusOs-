import { pgTable, uuid, text, timestamp, integer, bigint, date, jsonb, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { institutions } from './tenancy';
import { users } from './people';

/**
 * BILLING (CAMPUSOS-020) — manual invoicing, no payment gateway yet.
 * ---------------------------------------------------------------------------
 * Written only by platform operators; a college's administrators can read
 * their own subscription and invoices. Money is stored in paise (integers).
 * Prices are configured per college — nothing here is a validated market
 * price (strategy §26 lists them as hypotheses). Tax treatment (GST rate,
 * SAC code) is entered by the operator and must be confirmed by an
 * accountant; CampusOS does not decide it.
 */
export const subscriptions = pgTable(
  'subscriptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    /** PILOT | STARTER | PROFESSIONAL | ENTERPRISE */
    plan: text('plan').notNull(),
    /** PILOT | ACTIVE | PAST_DUE | CANCELLED */
    status: text('status').notNull().default('PILOT'),
    seats: integer('seats').notNull(),
    pricePerSeatPaise: bigint('price_per_seat_paise', { mode: 'number' }).notNull().default(0),
    currency: text('currency').notNull().default('INR'),
    periodStart: date('period_start').notNull(),
    periodEnd: date('period_end').notNull(),
    billingName: text('billing_name'),
    billingAddress: text('billing_address'),
    /** The college's GSTIN, if it has one (as provided by the college). */
    gstin: text('gstin'),
    placeOfSupply: text('place_of_supply'),
    notes: text('notes'),
    createdById: uuid('created_by_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('subscriptions_institution_idx').on(t.institutionId, t.createdAt)],
);

export const invoices = pgTable(
  'invoices',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'restrict' }),
    subscriptionId: uuid('subscription_id').references(() => subscriptions.id, { onDelete: 'set null' }),
    /** Sequential within the Indian financial year, e.g. CO/2026-27/0007. */
    invoiceNumber: text('invoice_number').notNull(),
    financialYear: text('financial_year').notNull(),
    sequence: integer('sequence').notNull(),
    issueDate: date('issue_date').notNull(),
    dueDate: date('due_date').notNull(),
    periodStart: date('period_start').notNull(),
    periodEnd: date('period_end').notNull(),
    description: text('description').notNull(),
    seats: integer('seats').notNull(),
    unitPricePaise: bigint('unit_price_paise', { mode: 'number' }).notNull(),
    subtotalPaise: bigint('subtotal_paise', { mode: 'number' }).notNull(),
    /** GST rate in basis points (1800 = 18%), as entered by the operator. */
    taxRateBp: integer('tax_rate_bp').notNull().default(0),
    taxPaise: bigint('tax_paise', { mode: 'number' }).notNull().default(0),
    totalPaise: bigint('total_paise', { mode: 'number' }).notNull(),
    sacCode: text('sac_code'),
    /** ISSUED | PAID | VOID */
    status: text('status').notNull().default('ISSUED'),
    paidAt: timestamp('paid_at', { withTimezone: true }),
    paymentReference: text('payment_reference'),
    voidReason: text('void_reason'),
    /** Seller and buyer details as they were when the invoice was issued. */
    seller: jsonb('seller').$type<Record<string, string | null>>().notNull(),
    buyer: jsonb('buyer').$type<Record<string, string | null>>().notNull(),
    createdById: uuid('created_by_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('invoices_number_uq').on(t.invoiceNumber),
    uniqueIndex('invoices_fy_seq_uq').on(t.financialYear, t.sequence),
    index('invoices_institution_idx').on(t.institutionId, t.issueDate),
    index('invoices_open_idx').on(t.status).where(sql`status = 'ISSUED'`),
  ],
);
