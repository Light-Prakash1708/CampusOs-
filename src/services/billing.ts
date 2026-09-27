import 'server-only';
import { and, count, desc, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import * as t from '@/lib/db/schema';
import { AppError, ConflictError, ForbiddenError, NotFoundError } from '@/lib/api';
import type { AuthContext } from '@/lib/auth/context';
import { recordAudit } from '@/services/audit';
import { isPlatformOperator } from '@/services/institutions';

/**
 * BILLING (CAMPUSOS-020) — plans, seats and manual invoices.
 * ---------------------------------------------------------------------------
 * Operators set each college's plan, seats and price; CampusOS issues a
 * sequentially numbered invoice (PDF) and records payment status by hand.
 * No payment gateway. No price is "validated" — the plan catalogue below
 * carries the strategy's hypotheses as *suggestions* only, and every price is
 * configurable per college. GST: the operator enters the rate and SAC code;
 * an accountant must confirm the treatment (see docs/BILLING.md).
 */

type Meta = { ipAddress: string | null; userAgent: string | null };

export const PLANS = {
  PILOT: { label: 'Pilot', note: 'Usually free for one semester, in exchange for feedback and a case study.' },
  STARTER: { label: 'Starter', note: 'Price hypothesis to validate: ₹150–300 per student per year.' },
  PROFESSIONAL: { label: 'Professional', note: 'Price hypothesis to validate: ₹300–600 per student per year.' },
  ENTERPRISE: { label: 'Enterprise / Group', note: 'Custom.' },
} as const;
export type Plan = keyof typeof PLANS;
export const SUBSCRIPTION_STATUSES = ['PILOT', 'ACTIVE', 'PAST_DUE', 'CANCELLED'] as const;

function assertOperator(ctx: AuthContext) {
  if (!isPlatformOperator(ctx)) throw new ForbiddenError('Only the CampusOS platform team manages billing.');
}

function assertCanRead(ctx: AuthContext, institutionId: string) {
  if (isPlatformOperator(ctx)) return;
  if (ctx.institutionId !== institutionId || !ctx.permissions.has('institution:manage')) throw new ForbiddenError();
}

/** "2026-27" for dates from 1 April 2026 to 31 March 2027. */
export function financialYear(isoDate: string): string {
  const [y, m] = isoDate.split('-').map(Number) as [number, number];
  const start = m >= 4 ? y : y - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
}

export function invoicePrefix(): string {
  const p = (process.env.BILLING_INVOICE_PREFIX ?? 'CO').replace(/[^A-Z0-9-]/gi, '').toUpperCase();
  return p || 'CO';
}

/** Seller details come from configuration, never from a request. */
export function sellerDetails(): Record<string, string | null> {
  const v = (k: string) => process.env[k]?.trim() || null;
  return {
    name: v('BILLING_SELLER_NAME') ?? 'CampusOS',
    address: v('BILLING_SELLER_ADDRESS'),
    gstin: v('BILLING_SELLER_GSTIN'),
    email: v('BILLING_SELLER_EMAIL'),
    state: v('BILLING_SELLER_STATE'),
  };
}

export interface SubscriptionInput {
  plan: Plan;
  status: (typeof SUBSCRIPTION_STATUSES)[number];
  seats: number;
  pricePerSeatRupees: number;
  periodStart: string;
  periodEnd: string;
  billingName?: string | null;
  billingAddress?: string | null;
  gstin?: string | null;
  placeOfSupply?: string | null;
  notes?: string | null;
}

const GSTIN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]$/;

export async function activeStudentCount(institutionId: string): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(t.users)
    .where(and(eq(t.users.institutionId, institutionId), eq(t.users.role, 'STUDENT'), eq(t.users.status, 'ACTIVE')));
  return Number(row?.n ?? 0);
}

export async function setSubscription(ctx: AuthContext, institutionId: string, input: SubscriptionInput, meta: Meta) {
  assertOperator(ctx);
  if (!(input.plan in PLANS)) throw new AppError('Unknown plan.', 422, 'BAD_PLAN');
  if (!Number.isInteger(input.seats) || input.seats < 0 || input.seats > 1_000_000) throw new AppError('Seats must be a whole number.', 422, 'BAD_SEATS');
  if (!(input.pricePerSeatRupees >= 0) || input.pricePerSeatRupees > 100_000) throw new AppError('Enter a valid price.', 422, 'BAD_PRICE');
  if (input.periodEnd <= input.periodStart) throw new AppError('The period must end after it starts.', 422, 'BAD_PERIOD');
  const gstin = input.gstin?.trim().toUpperCase() || null;
  if (gstin && !GSTIN.test(gstin)) throw new AppError('That GSTIN does not look right.', 422, 'BAD_GSTIN');

  const [inst] = await db.select({ id: t.institutions.id, kind: t.institutions.kind, isDemo: t.institutions.isDemo }).from(t.institutions).where(eq(t.institutions.id, institutionId)).limit(1);
  if (!inst) throw new NotFoundError('Institution');
  if (inst.kind !== 'COLLEGE' || inst.isDemo) throw new AppError('Only real colleges are billed.', 422, 'NOT_BILLABLE');

  const [row] = await db
    .insert(t.subscriptions)
    .values({
      institutionId,
      plan: input.plan,
      status: input.status,
      seats: input.seats,
      pricePerSeatPaise: Math.round(input.pricePerSeatRupees * 100),
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      billingName: input.billingName?.trim() || null,
      billingAddress: input.billingAddress?.trim() || null,
      gstin,
      placeOfSupply: input.placeOfSupply?.trim() || null,
      notes: input.notes?.trim() || null,
      createdById: ctx.userId,
    })
    .returning({ id: t.subscriptions.id });
  // Keep the institution's tier in step, so module tiers mean something.
  const tier = input.plan === 'PILOT' ? 'PROFESSIONAL' : input.plan;
  await db.update(t.institutions).set({ subscriptionTier: tier as never }).where(eq(t.institutions.id, institutionId));
  await recordAudit(ctx, { action: 'BILLING_PLAN_UPDATED', entityType: 'institution', entityId: institutionId, after: { plan: input.plan, status: input.status, seats: input.seats, pricePerSeatPaise: Math.round(input.pricePerSeatRupees * 100) }, ...meta });
  await recordAudit(null, { action: 'BILLING_PLAN_UPDATED', entityType: 'subscription', entityId: row!.id, after: { plan: input.plan, seats: input.seats } }, institutionId);
  return { id: row!.id };
}

export async function currentSubscription(ctx: AuthContext, institutionId: string) {
  assertCanRead(ctx, institutionId);
  const [row] = await db.select().from(t.subscriptions).where(eq(t.subscriptions.institutionId, institutionId)).orderBy(desc(t.subscriptions.createdAt)).limit(1);
  return row ?? null;
}

export async function listInvoices(ctx: AuthContext, institutionId: string) {
  assertCanRead(ctx, institutionId);
  return db.select().from(t.invoices).where(eq(t.invoices.institutionId, institutionId)).orderBy(desc(t.invoices.issueDate), desc(t.invoices.sequence)).limit(200);
}

export async function getInvoice(ctx: AuthContext, invoiceId: string) {
  const [row] = await db.select().from(t.invoices).where(eq(t.invoices.id, invoiceId)).limit(1);
  if (!row) throw new NotFoundError('Invoice');
  try {
    assertCanRead(ctx, row.institutionId);
  } catch {
    throw new NotFoundError('Invoice'); // don't reveal other colleges' invoices exist
  }
  return row;
}

const todayIst = () => new Date(Date.now() + 5.5 * 3_600_000).toISOString().slice(0, 10);
const addDaysIso = (iso: string, days: number) => new Date(new Date(`${iso}T00:00:00Z`).getTime() + days * 86_400_000).toISOString().slice(0, 10);

/**
 * Issues the next invoice for the college's current subscription. Numbering is
 * sequential per financial year and gap-free under concurrency (advisory lock
 * + unique index).
 */
export async function issueInvoice(
  ctx: AuthContext,
  institutionId: string,
  input: { taxRatePercent?: number; sacCode?: string | null; dueInDays?: number; description?: string | null },
  meta: Meta,
) {
  assertOperator(ctx);
  const sub = await currentSubscription(ctx, institutionId);
  if (!sub) throw new AppError('Set up a plan for this college first.', 409, 'NO_SUBSCRIPTION');
  if (sub.status === 'CANCELLED') throw new AppError('This subscription is cancelled.', 409, 'CANCELLED');
  const rate = input.taxRatePercent ?? Number(process.env.BILLING_DEFAULT_GST_PERCENT ?? 0);
  if (!(rate >= 0 && rate <= 28)) throw new AppError('Enter a tax rate between 0 and 28%.', 422, 'BAD_TAX');
  const [inst] = await db.select({ name: t.institutions.name, city: t.institutions.city, state: t.institutions.state }).from(t.institutions).where(eq(t.institutions.id, institutionId)).limit(1);

  const issueDate = todayIst();
  const fy = financialYear(issueDate);
  const subtotal = sub.seats * sub.pricePerSeatPaise;
  const taxRateBp = Math.round(rate * 100);
  const tax = Math.round((subtotal * taxRateBp) / 10_000);
  const seller = sellerDetails();
  const buyer = {
    name: sub.billingName ?? inst?.name ?? null,
    address: sub.billingAddress ?? [inst?.city, inst?.state].filter(Boolean).join(', ') ?? null,
    gstin: sub.gstin,
    placeOfSupply: sub.placeOfSupply ?? inst?.state ?? null,
  };

  const invoice = await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('campusos:invoice-sequence'))`);
    const [{ next }] = (await tx
      .select({ next: sql<number>`coalesce(max(${t.invoices.sequence}), 0) + 1` })
      .from(t.invoices)
      .where(eq(t.invoices.financialYear, fy))) as [{ next: number }];
    const seq = Number(next);
    const [row] = await tx
      .insert(t.invoices)
      .values({
        institutionId,
        subscriptionId: sub.id,
        invoiceNumber: `${invoicePrefix()}/${fy}/${String(seq).padStart(4, '0')}`,
        financialYear: fy,
        sequence: seq,
        issueDate,
        dueDate: addDaysIso(issueDate, Math.min(Math.max(input.dueInDays ?? 30, 0), 120)),
        periodStart: sub.periodStart,
        periodEnd: sub.periodEnd,
        description: (input.description?.trim() || `CampusOS ${PLANS[sub.plan as Plan]?.label ?? sub.plan} — ${sub.seats} students, ${sub.periodStart} to ${sub.periodEnd}`).slice(0, 300),
        seats: sub.seats,
        unitPricePaise: sub.pricePerSeatPaise,
        subtotalPaise: subtotal,
        taxRateBp,
        taxPaise: tax,
        totalPaise: subtotal + tax,
        sacCode: input.sacCode?.trim() || null,
        seller,
        buyer,
        createdById: ctx.userId,
      })
      .returning();
    return row!;
  });
  await recordAudit(ctx, { action: 'INVOICE_ISSUED', entityType: 'invoice', entityId: invoice.id, after: { number: invoice.invoiceNumber, totalPaise: invoice.totalPaise }, ...meta });
  await recordAudit(null, { action: 'INVOICE_ISSUED', entityType: 'invoice', entityId: invoice.id, after: { number: invoice.invoiceNumber } }, institutionId);
  return invoice;
}

export async function setInvoiceStatus(
  ctx: AuthContext,
  invoiceId: string,
  input: { status: 'PAID' | 'VOID'; reference?: string | null; reason?: string | null },
  meta: Meta,
) {
  assertOperator(ctx);
  const [inv] = await db.select().from(t.invoices).where(eq(t.invoices.id, invoiceId)).limit(1);
  if (!inv) throw new NotFoundError('Invoice');
  if (inv.status !== 'ISSUED') throw new ConflictError(`This invoice is already ${inv.status.toLowerCase()}.`);
  if (input.status === 'VOID' && !input.reason?.trim()) throw new AppError('Give a reason for voiding the invoice.', 422, 'REASON_REQUIRED');
  await db
    .update(t.invoices)
    .set(input.status === 'PAID'
      ? { status: 'PAID', paidAt: new Date(), paymentReference: input.reference?.trim().slice(0, 120) || null }
      : { status: 'VOID', voidReason: input.reason!.trim().slice(0, 300) })
    .where(and(eq(t.invoices.id, invoiceId), eq(t.invoices.status, 'ISSUED')));
  await recordAudit(ctx, { action: 'INVOICE_STATUS_CHANGED', entityType: 'invoice', entityId: invoiceId, before: { status: 'ISSUED' }, after: { status: input.status }, reason: input.reason ?? null, ...meta });
}

/* --------------------------------- PDF ------------------------------------ */

const rupees = (paise: number) => `INR ${(paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** A simple, printable A4 invoice. Labelled "Tax Invoice" only when the seller has a GSTIN configured. */
export async function invoicePdf(inv: typeof t.invoices.$inferSelect): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
  const doc = await PDFDocument.create();
  doc.setTitle(`Invoice ${inv.invoiceNumber}`);
  doc.setCreator('CampusOS');
  const page = doc.addPage([595.28, 841.89]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  // Standard fonts cover WinAnsi only: keep text ASCII-safe.
  const safe = (s: string | null | undefined) => (s ?? '').normalize('NFKD').replace(/[^\x20-\x7E]/g, '');
  let y = 790;
  const line = (text: string, opts: { x?: number; size?: number; b?: boolean; color?: [number, number, number] } = {}) => {
    page.drawText(safe(text), { x: opts.x ?? 50, y, size: opts.size ?? 10, font: opts.b ? bold : font, color: rgb(...(opts.color ?? [0.1, 0.1, 0.12])) });
  };
  const seller = inv.seller as Record<string, string | null>;
  const buyer = inv.buyer as Record<string, string | null>;
  line(seller.gstin ? 'TAX INVOICE' : 'INVOICE', { size: 18, b: true });
  line(inv.invoiceNumber, { x: 380, size: 12, b: true });
  y -= 18;
  line(`Issued ${inv.issueDate}   Due ${inv.dueDate}`, { x: 380 });
  y -= 34;
  line('From', { b: true });
  line('Bill to', { x: 320, b: true });
  y -= 15;
  const left = [seller.name, seller.address, seller.gstin ? `GSTIN ${seller.gstin}` : null, seller.email].filter(Boolean) as string[];
  const right = [buyer.name, buyer.address, buyer.gstin ? `GSTIN ${buyer.gstin}` : null, buyer.placeOfSupply ? `Place of supply: ${buyer.placeOfSupply}` : null].filter(Boolean) as string[];
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    if (left[i]) line(left[i]!.slice(0, 48));
    if (right[i]) line(right[i]!.slice(0, 48), { x: 320 });
    y -= 14;
  }
  y -= 24;
  page.drawLine({ start: { x: 50, y: y + 12 }, end: { x: 545, y: y + 12 }, thickness: 0.8, color: rgb(0.8, 0.8, 0.82) });
  line('Description', { b: true });
  line('Qty', { x: 360, b: true });
  line('Rate', { x: 410, b: true });
  line('Amount', { x: 480, b: true });
  y -= 16;
  const desc = safe(inv.description);
  for (let i = 0; i < desc.length && i < 240; i += 55) {
    line(desc.slice(i, i + 55));
    if (i === 0) {
      line(String(inv.seats), { x: 360 });
      line((inv.unitPricePaise / 100).toFixed(2), { x: 410 });
      line((inv.subtotalPaise / 100).toFixed(2), { x: 480 });
    }
    y -= 14;
  }
  if (inv.sacCode) {
    line(`SAC ${inv.sacCode}`, { color: [0.4, 0.4, 0.45] });
    y -= 14;
  }
  y -= 16;
  page.drawLine({ start: { x: 320, y: y + 12 }, end: { x: 545, y: y + 12 }, thickness: 0.8, color: rgb(0.8, 0.8, 0.82) });
  line('Subtotal', { x: 320 });
  line(rupees(inv.subtotalPaise), { x: 440 });
  y -= 15;
  line(`Tax (${(inv.taxRateBp / 100).toFixed(2)}%)`, { x: 320 });
  line(rupees(inv.taxPaise), { x: 440 });
  y -= 17;
  line('Total', { x: 320, b: true, size: 12 });
  line(rupees(inv.totalPaise), { x: 440, b: true, size: 12 });
  y -= 36;
  if (inv.status !== 'ISSUED') {
    line(inv.status === 'PAID' ? `PAID${inv.paymentReference ? ` - ref ${inv.paymentReference}` : ''}` : `VOID - ${inv.voidReason ?? ''}`, { b: true, color: inv.status === 'PAID' ? [0.1, 0.5, 0.2] : [0.7, 0.1, 0.1] });
    y -= 20;
  }
  line(`Service period: ${inv.periodStart} to ${inv.periodEnd}`, { size: 9, color: [0.4, 0.4, 0.45] });
  y -= 13;
  line('Generated by CampusOS. Tax treatment as entered by the issuer.', { size: 9, color: [0.4, 0.4, 0.45] });
  return doc.save();
}
