import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { db, pool } from '@/lib/db';
import * as t from '@/lib/db/schema';
import { availableCopies, canRenew, daysOverdue, fineFor, LIBRARY_POLICY, normaliseIsbn } from '@/lib/library';
import { buildToday } from '@/lib/today';
import { cancelReservation, createBook, issueLoan, myLibrary, renewLoan, reserveBook, returnLoan, searchBooks, updateBook } from '@/services/library';
import { listStudentResources, setResourceSaved } from '@/services/resources';
import { createTenant, createUser, ctxFor, dropTenant, meta, type TestTenant } from './helpers';

const DAY = 86_400_000;

/* --------------------------------- pure ----------------------------------- */

describe('library rules', () => {
  it('computes overdue days, capped fines and availability', () => {
    const due = new Date('2026-09-10T12:00:00Z');
    expect(daysOverdue(due, new Date('2026-09-10T11:00:00Z'))).toBe(0);
    expect(daysOverdue(due, new Date('2026-09-10T12:01:00Z'))).toBe(1);
    expect(daysOverdue(due, new Date('2026-09-13T12:00:00Z'))).toBe(3);
    expect(fineFor({ dueAt: due, returnedAt: new Date('2026-09-13T12:00:00Z') })).toBe(3 * LIBRARY_POLICY.finePerDayInr);
    expect(fineFor({ dueAt: due, returnedAt: new Date('2027-09-13T12:00:00Z') })).toBe(LIBRARY_POLICY.maxFineInr);
    expect(fineFor({ dueAt: due, returnedAt: new Date('2026-09-20T12:00:00Z'), fineWaived: true })).toBe(0);
    expect(availableCopies(3, 1, 1)).toBe(1);
    expect(availableCopies(1, 2, 0)).toBe(0);
  });
  it('renews from the due date, never when overdue, over the limit or reserved', () => {
    const now = new Date('2026-09-01T00:00:00Z');
    const due = new Date('2026-09-05T00:00:00Z');
    const ok = canRenew({ dueAt: due, renewals: 0, returnedAt: null }, 0, now);
    expect(ok).toEqual({ ok: true, newDueAt: new Date(due.getTime() + LIBRARY_POLICY.loanDays * DAY) });
    expect(canRenew({ dueAt: due, renewals: LIBRARY_POLICY.maxRenewals, returnedAt: null }, 0, now)).toMatchObject({ ok: false, reason: 'LIMIT' });
    expect(canRenew({ dueAt: due, renewals: 0, returnedAt: null }, 1, now)).toMatchObject({ ok: false, reason: 'RESERVED' });
    expect(canRenew({ dueAt: due, renewals: 0, returnedAt: null }, 0, new Date('2026-09-06T00:00:00Z'))).toMatchObject({ ok: false, reason: 'OVERDUE' });
  });
  it('validates ISBNs', () => {
    expect(normaliseIsbn('978-81-203-4053-5')).toBe('9788120340535');
    expect(normaliseIsbn('0-306-40615-X')).toBe('030640615X');
    expect(normaliseIsbn('12345')).toBeNull();
  });
  it('puts overdue books at the top of Your Day', () => {
    const items = buildToday({
      today: '2026-09-26',
      nowMinutes: 600,
      timeZone: 'Asia/Kolkata',
      classes: [],
      nextClass: null,
      assignments: [],
      attentionSubjects: [],
      events: [],
      notices: [],
      loans: [
        { id: 'a', title: 'Late book', dueAt: new Date('2026-09-20T06:00:00Z') },
        { id: 'b', title: 'Tomorrow book', dueAt: new Date('2026-09-27T06:00:00Z') },
        { id: 'c', title: 'Later book', dueAt: new Date('2026-10-20T06:00:00Z') },
      ],
    });
    expect(items.map((i) => i.key)).toEqual(['lib-a', 'lib-b']);
    expect(items[0]).toMatchObject({ urgent: true, when: 'Overdue' });
  });
});

/* ------------------------------ integration ------------------------------- */

let A: TestTenant;
let B: TestTenant;

beforeAll(async () => {
  A = await createTenant();
  B = await createTenant();
  for (const id of [A.id, B.id]) {
    await db.update(t.institutions).set({ featureFlags: { library_enabled: true, resource_hub_enabled: true } }).where(eq(t.institutions.id, id));
  }
});

afterAll(async () => {
  await dropTenant(A.id);
  await dropTenant(B.id);
  await pool.end();
});

const staff = async (tenant: TestTenant = A) => ctxFor((await createUser(tenant, { role: 'ADMIN' })).id);
async function student(tenant: TestTenant = A) {
  const u = await createUser(tenant);
  return { ctx: await ctxFor(u.id), email: u.email };
}

describe('circulation', () => {
  it('lends only available copies, never the last copy twice under concurrency', async () => {
    const desk = await staff();
    const { id } = await createBook(desk, { title: 'Scarce Book', totalCopies: 1 }, meta());
    const readers = await Promise.all([1, 2, 3, 4].map(() => student()));
    const results = await Promise.allSettled(readers.map((r) => issueLoan(desk, { bookId: id, borrower: r.email }, meta())));
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const [book] = await searchBooks(desk, { q: 'Scarce Book' });
    expect(book).toMatchObject({ onLoan: 1, available: 0 });
  });

  it('queues reservations, holds a returned copy for the first in line, and lends it only to them', async () => {
    const desk = await staff();
    const { id } = await createBook(desk, { title: 'Queue Book', totalCopies: 1 }, meta());
    const [holder, first, second] = await Promise.all([student(), student(), student()]);
    await expect(reserveBook(first.ctx, id)).rejects.toThrow(/on the shelf/);
    const loan = await issueLoan(desk, { bookId: id, borrower: holder.email }, meta());
    expect((await reserveBook(first.ctx, id)).position).toBe(1);
    expect((await reserveBook(second.ctx, id)).position).toBe(2);
    await expect(reserveBook(first.ctx, id)).rejects.toThrow(/already reserved/);
    // Someone is waiting: no renewal.
    await expect(renewLoan(holder.ctx, loan.id, meta())).rejects.toThrow(/waiting/);

    await returnLoan(desk, loan.id, {}, meta());
    const mine = await myLibrary(first.ctx);
    expect(mine.reservations[0]).toMatchObject({ status: 'READY' });
    const [note] = await db.select().from(t.notifications).where(and(eq(t.notifications.userId, first.ctx.userId), eq(t.notifications.sourceType, 'library_reservation')));
    expect(note?.title).toMatch(/Ready to collect/);
    await expect(issueLoan(desk, { bookId: id, borrower: second.email }, meta())).rejects.toThrow(/held for people in the reservation queue/);
    await issueLoan(desk, { bookId: id, borrower: first.email }, meta());
    expect((await myLibrary(first.ctx)).reservations[0]).toMatchObject({ status: 'FULFILLED' });
    expect((await myLibrary(second.ctx)).reservations[0]).toMatchObject({ status: 'WAITING', position: 1 });
  });

  it('expires uncollected holds and passes the copy on; cancelling a hold does the same', async () => {
    const desk = await staff();
    const { id } = await createBook(desk, { title: 'Hold Book', totalCopies: 1 }, meta());
    const [holder, a, b] = await Promise.all([student(), student(), student()]);
    const loan = await issueLoan(desk, { bookId: id, borrower: holder.email }, meta());
    await reserveBook(a.ctx, id);
    await reserveBook(b.ctx, id);
    await returnLoan(desk, loan.id, {}, meta());
    // a's hold lapses.
    await db.update(t.libraryReservations).set({ readyUntil: new Date(Date.now() - 1000) }).where(and(eq(t.libraryReservations.bookId, id), eq(t.libraryReservations.userId, a.ctx.userId)));
    await expect(issueLoan(desk, { bookId: id, borrower: holder.email }, meta())).rejects.toThrow(/held/);
    expect((await myLibrary(a.ctx)).reservations[0]).toMatchObject({ status: 'EXPIRED' });
    const bRes = (await myLibrary(b.ctx)).reservations[0]!;
    expect(bRes.status).toBe('READY');
    await cancelReservation(b.ctx, bRes.id);
    expect((await searchBooks(desk, { q: 'Hold Book' }))[0]).toMatchObject({ available: 1 });
  });

  it('renews within the rules and computes fines on return, with an audited waiver', async () => {
    const desk = await staff();
    const reader = await student();
    const { id } = await createBook(desk, { title: 'Fine Book', totalCopies: 2 }, meta());
    const loan = await issueLoan(desk, { bookId: id, borrower: reader.email }, meta());
    const r1 = await renewLoan(reader.ctx, loan.id, meta());
    expect(r1.renewals).toBe(1);
    await renewLoan(reader.ctx, loan.id, meta());
    await expect(renewLoan(reader.ctx, loan.id, meta())).rejects.toThrow(/renewed it 2 times/);
    await db.update(t.libraryLoans).set({ issuedAt: new Date(Date.now() - 30 * DAY), dueAt: new Date(Date.now() - 5 * DAY + 60_000) }).where(eq(t.libraryLoans.id, loan.id));
    expect((await myLibrary(reader.ctx)).loans[0]).toMatchObject({ overdue: true, fineInr: 5 * LIBRARY_POLICY.finePerDayInr, canRenew: false });
    await expect(returnLoan(desk, loan.id, { waiveFine: true, waiveReason: '' }, meta())).rejects.toThrow(/why/);
    const ret = await returnLoan(desk, loan.id, { waiveFine: true, waiveReason: 'Medical leave' }, meta());
    expect(ret.fineInr).toBe(0);
    const audits = await db.select().from(t.auditLogs).where(and(eq(t.auditLogs.entityId, loan.id), eq(t.auditLogs.action, 'LIBRARY_FINE_WAIVED')));
    expect(audits).toHaveLength(1);
    await expect(returnLoan(desk, loan.id, {}, meta())).rejects.toThrow(/already returned/);
  });

  it('keeps colleges, borrowers and staff powers apart', async () => {
    const deskA = await staff(A);
    const deskB = await staff(B);
    const { id } = await createBook(deskA, { title: 'Private Collection', totalCopies: 2 }, meta());
    const outsider = await student(B);
    const reader = await student(A);
    // B's desk can't see or lend A's book, or lend to A's student.
    expect(await searchBooks(deskB, { q: 'Private Collection' })).toHaveLength(0);
    await expect(issueLoan(deskB, { bookId: id, borrower: outsider.email }, meta())).rejects.toThrow(/not found/i);
    await expect(issueLoan(deskA, { bookId: id, borrower: outsider.email }, meta())).rejects.toThrow(/No one at your college/);
    // Students can't run the desk, or renew someone else's loan.
    await expect(issueLoan(reader.ctx, { bookId: id, borrower: reader.email }, meta())).rejects.toThrow(/library staff/);
    const loan = await issueLoan(deskA, { bookId: id, borrower: reader.email }, meta());
    const other = await student(A);
    await expect(renewLoan(other.ctx, loan.id, meta())).rejects.toThrow(/not found/i);
    // Copies can't drop below what's out.
    await expect(updateBook(deskA, id, { totalCopies: 0 }, meta())).rejects.toThrow(/fewer than 1/);
    // Duplicate ISBN.
    await createBook(deskA, { title: 'Isbn 1', isbn: '978-81-203-4053-5', totalCopies: 1 }, meta());
    await expect(createBook(deskA, { title: 'Isbn 2', isbn: '9788120340535', totalCopies: 1 }, meta())).rejects.toThrow(/already in the catalogue/);
    // The flag gates everything.
    await expect(searchBooks({ ...reader.ctx, featureFlags: {} }, {})).rejects.toThrow(/not switched on/);
  });
});

describe('saved resources', () => {
  it('saves only resources the student can see', async () => {
    const reader = await student(A);
    const owner = await createUser(A, { role: 'FACULTY' });
    const [visible, hidden, draft] = await db
      .insert(t.resources)
      .values([
        { institutionId: A.id, ownerId: owner.id, title: 'PYQ 2025 Accounts', kind: 'QUESTION_BANK', visibility: 'INSTITUTION', status: 'PUBLISHED' },
        { institutionId: A.id, ownerId: owner.id, title: 'Staff only', kind: 'NOTES', visibility: 'PRIVATE', status: 'PUBLISHED' },
        { institutionId: A.id, ownerId: owner.id, title: 'AI draft', kind: 'NOTES', visibility: 'INSTITUTION', status: 'AI_GENERATED_PENDING_REVIEW' },
      ] as (typeof t.resources.$inferInsert)[])
      .returning({ id: t.resources.id });
    await setResourceSaved(reader.ctx, visible!.id, true);
    await setResourceSaved(reader.ctx, visible!.id, true); // idempotent
    await expect(setResourceSaved(reader.ctx, hidden!.id, true)).rejects.toThrow(/not found/i);
    await expect(setResourceSaved(reader.ctx, draft!.id, true)).rejects.toThrow(/not found/i);
    const outsider = await student(B);
    await expect(setResourceSaved(outsider.ctx, visible!.id, true)).rejects.toThrow(/not found/i);
    const saved = await listStudentResources(reader.ctx, { savedOnly: true });
    expect(saved.map((r) => r.id)).toEqual([visible!.id]);
    expect((await listStudentResources(reader.ctx, { kinds: ['QUESTION_BANK'] })).map((r) => r.id)).toContain(visible!.id);
    await setResourceSaved(reader.ctx, visible!.id, false);
    expect(await listStudentResources(reader.ctx, { savedOnly: true })).toHaveLength(0);
  });
});
