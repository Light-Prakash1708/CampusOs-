import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { db, pool } from '@/lib/db';
import * as t from '@/lib/db/schema';
import { currentSubscription, financialYear, getInvoice, invoicePdf, issueInvoice, listInvoices, setInvoiceStatus, setSubscription } from '@/services/billing';
import { createTenant, createUser, ctxFor, dropTenant, meta, type TestTenant } from './helpers';

/**
 * CAMPUSOS-020: operators set plans and issue sequential invoices; colleges
 * read only their own; money adds up; nothing is billed to demos.
 */

let hq: TestTenant;
let college: TestTenant;
let other: TestTenant;
let operatorId: string;
const base = {
  plan: 'STARTER' as const,
  status: 'ACTIVE' as const,
  seats: 1200,
  pricePerSeatRupees: 199.5,
  periodStart: '2026-07-01',
  periodEnd: '2027-06-30',
  billingName: 'Test College Trust',
  gstin: '19ABCDE1234F1Z5',
};

beforeAll(async () => {
  hq = await createTenant();
  college = await createTenant();
  other = await createTenant();
  operatorId = (await createUser(hq, { role: 'SUPER_ADMIN' })).id;
});
afterEach(() => vi.unstubAllEnvs());
afterAll(async () => {
  // Invoices restrict institution deletion; clear them first (test data only).
  await db.execute(sql`DELETE FROM invoices WHERE institution_id IN (${college.id}, ${other.id})`);
  for (const x of [hq, college, other]) await dropTenant(x.id);
  await pool.end();
});

async function operator() {
  const ctx = await ctxFor(operatorId);
  vi.stubEnv('PLATFORM_OPERATOR_EMAILS', ctx.email);
  return ctx;
}

describe('financial year', () => {
  it('runs April to March', () => {
    expect(financialYear('2026-03-31')).toBe('2025-26');
    expect(financialYear('2026-04-01')).toBe('2026-27');
    expect(financialYear('2027-01-15')).toBe('2026-27');
  });
});

describe('plans', () => {
  it('only operators set them; the college reads its own; validation holds', async () => {
    const op = await operator();
    const admin = await ctxFor((await createUser(college, { role: 'SUPER_ADMIN' })).id);
    await expect(setSubscription(admin, college.id, base, meta())).rejects.toMatchObject({ status: 403 });
    await expect(setSubscription(op, college.id, { ...base, gstin: 'NOT-A-GSTIN' }, meta())).rejects.toMatchObject({ code: 'BAD_GSTIN' });
    await expect(setSubscription(op, college.id, { ...base, periodEnd: '2026-06-01' }, meta())).rejects.toMatchObject({ code: 'BAD_PERIOD' });
    await setSubscription(op, college.id, base, meta());
    const sub = await currentSubscription(admin, college.id);
    expect(sub).toMatchObject({ plan: 'STARTER', seats: 1200, pricePerSeatPaise: 19950 });
    const [inst] = await db.select({ tier: t.institutions.subscriptionTier }).from(t.institutions).where(eq(t.institutions.id, college.id));
    expect(inst!.tier).toBe('STARTER');
    const foreign = await ctxFor((await createUser(other, { role: 'SUPER_ADMIN' })).id);
    await expect(currentSubscription(foreign, college.id)).rejects.toMatchObject({ status: 403 });
  });

  it('never bills a demo or a personal workspace', async () => {
    const op = await operator();
    const demo = await createTenant();
    await db.update(t.institutions).set({ isDemo: true }).where(eq(t.institutions.id, demo.id));
    await expect(setSubscription(op, demo.id, base, meta())).rejects.toMatchObject({ code: 'NOT_BILLABLE' });
    await dropTenant(demo.id);
  });
});

describe('invoices', () => {
  it('are numbered sequentially without gaps, even when issued concurrently, and add up', async () => {
    const op = await operator();
    const [a, b, c] = await Promise.all([
      issueInvoice(op, college.id, { taxRatePercent: 18 }, meta()),
      issueInvoice(op, college.id, { taxRatePercent: 18 }, meta()),
      issueInvoice(op, college.id, { taxRatePercent: 18 }, meta()),
    ]);
    const seqs = [a!, b!, c!].map((i) => i.sequence).sort((x, y) => x - y);
    expect(seqs[1]! - seqs[0]!).toBe(1);
    expect(seqs[2]! - seqs[1]!).toBe(1);
    expect(a!.invoiceNumber).toMatch(/^CO\/\d{4}-\d{2}\/\d{4}$/);
    expect(a!.subtotalPaise).toBe(1200 * 19950);
    expect(a!.taxPaise).toBe(Math.round((1200 * 19950 * 1800) / 10000));
    expect(a!.totalPaise).toBe(a!.subtotalPaise + a!.taxPaise);
  });

  it('are readable as PDF by the college, invisible to others, and change status once', async () => {
    const op = await operator();
    const inv = await issueInvoice(op, college.id, {}, meta());
    const admin = await ctxFor((await createUser(college, { role: 'SUPER_ADMIN' })).id);
    const mine = await getInvoice(admin, inv.id);
    const pdf = await invoicePdf(mine);
    expect(new TextDecoder().decode(pdf.slice(0, 5))).toBe('%PDF-');
    const foreign = await ctxFor((await createUser(other, { role: 'SUPER_ADMIN' })).id);
    await expect(getInvoice(foreign, inv.id)).rejects.toMatchObject({ status: 404 });
    await expect(setInvoiceStatus(admin, inv.id, { status: 'PAID' }, meta())).rejects.toMatchObject({ status: 403 });
    await expect(setInvoiceStatus(op, inv.id, { status: 'VOID' }, meta())).rejects.toMatchObject({ code: 'REASON_REQUIRED' });
    await setInvoiceStatus(op, inv.id, { status: 'PAID', reference: 'UTR123' }, meta());
    await expect(setInvoiceStatus(op, inv.id, { status: 'VOID', reason: 'x' }, meta())).rejects.toMatchObject({ status: 409 });
    const list = await listInvoices(admin, college.id);
    expect(list.find((i) => i.id === inv.id)).toMatchObject({ status: 'PAID', paymentReference: 'UTR123' });
  });

  it('titles the PDF "Tax Invoice" only when the seller GSTIN is configured', async () => {
    const op = await operator();
    const plain = await issueInvoice(op, college.id, {}, meta());
    expect((plain.seller as Record<string, unknown>).gstin).toBeNull();
    vi.stubEnv('BILLING_SELLER_GSTIN', '29ABCDE1234F1Z5');
    const taxed = await issueInvoice(op, college.id, {}, meta());
    expect((taxed.seller as Record<string, unknown>).gstin).toBe('29ABCDE1234F1Z5');
  });
});
