import 'server-only';
import { and, asc, count, desc, eq, ilike, inArray, isNull, lt, or, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import * as t from '@/lib/db/schema';
import { AppError, ConflictError, ForbiddenError, NotFoundError } from '@/lib/api';
import type { AuthContext } from '@/lib/auth/context';
import { isEnabled } from '@/lib/features';
import { availableCopies, canRenew, dueDateFrom, fineFor, holdUntil, LIBRARY_POLICY, normaliseIsbn, RENEW_REASON } from '@/lib/library';
import { uuidArray } from '@/lib/db/sql-helpers';
import { recordAudit } from '@/services/audit';
import { enforceRateLimit, keyFor } from '@/services/rate-limit';

/**
 * LIBRARY SERVICE
 * ---------------------------------------------------------------------------
 * Catalogue, circulation (issue / return / renew) and the reservation queue.
 * Borrowers are always resolved inside the caller's own college; students
 * can only see and act on their own loans and reservations.
 */

type Meta = { ipAddress: string | null; userAgent: string | null };
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export function requireLibrary(ctx: AuthContext) {
  if (!isEnabled(ctx.featureFlags, 'library_enabled')) throw new AppError('The library is not switched on at your college.', 404, 'FEATURE_DISABLED');
}

function requireManage(ctx: AuthContext) {
  requireLibrary(ctx);
  if (!ctx.permissions.has('library:manage')) throw new ForbiddenError('Only library staff can do that.');
}

const likeEscape = (s: string) => `%${s.replace(/[%_\\]/g, (m) => `\\${m}`)}%`;

/* ------------------------------ availability ------------------------------ */

async function counts(exec: typeof db | Tx, bookIds: string[]) {
  if (!bookIds.length) return new Map<string, { loans: number; holds: number; waiting: number }>();
  const [loans, res] = await Promise.all([
    exec
      .select({ bookId: t.libraryLoans.bookId, n: count() })
      .from(t.libraryLoans)
      .where(and(inArray(t.libraryLoans.bookId, bookIds), isNull(t.libraryLoans.returnedAt)))
      .groupBy(t.libraryLoans.bookId),
    exec
      .select({ bookId: t.libraryReservations.bookId, status: t.libraryReservations.status, n: count() })
      .from(t.libraryReservations)
      .where(and(inArray(t.libraryReservations.bookId, bookIds), inArray(t.libraryReservations.status, ['WAITING', 'READY'])))
      .groupBy(t.libraryReservations.bookId, t.libraryReservations.status),
  ]);
  const out = new Map<string, { loans: number; holds: number; waiting: number }>();
  for (const id of bookIds) out.set(id, { loans: 0, holds: 0, waiting: 0 });
  for (const l of loans) out.get(l.bookId)!.loans = Number(l.n);
  for (const r of res) {
    const c = out.get(r.bookId)!;
    if (r.status === 'READY') c.holds = Number(r.n);
    else c.waiting = Number(r.n);
  }
  return out;
}

/** Expire holds nobody collected, then offer free copies to the queue in order. */
async function settleQueue(tx: Tx, bookId: string, now = new Date()) {
  await tx
    .update(t.libraryReservations)
    .set({ status: 'EXPIRED', closedAt: now })
    .where(and(eq(t.libraryReservations.bookId, bookId), eq(t.libraryReservations.status, 'READY'), lt(t.libraryReservations.readyUntil, now)));
  const [book] = await tx.select().from(t.libraryBooks).where(eq(t.libraryBooks.id, bookId)).limit(1);
  if (!book) return;
  const c = (await counts(tx, [bookId])).get(bookId)!;
  let free = availableCopies(book.totalCopies, c.loans, c.holds);
  if (free <= 0 || c.waiting === 0) return;
  const next = await tx
    .select()
    .from(t.libraryReservations)
    .where(and(eq(t.libraryReservations.bookId, bookId), eq(t.libraryReservations.status, 'WAITING')))
    .orderBy(asc(t.libraryReservations.createdAt))
    .limit(free);
  for (const r of next) {
    if (free <= 0) break;
    await tx.update(t.libraryReservations).set({ status: 'READY', readyAt: now, readyUntil: holdUntil(now) }).where(eq(t.libraryReservations.id, r.id));
    await tx.insert(t.notifications).values({
      institutionId: book.institutionId,
      userId: r.userId,
      title: `Ready to collect: ${book.title}`,
      body: `A copy is held for you at the library desk until ${holdUntil(now).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}.`,
      priority: 'IMPORTANT',
      category: 'ACADEMIC',
      actionUrl: '/student/library?tab=reservations',
      groupKey: `library:${bookId}`,
      sourceType: 'library_reservation',
      sourceId: r.id,
    });
    free--;
  }
}

/**
 * Settle a book's queue in its own transaction, so expiries and promotions
 * stick even when the caller's own action is then refused (and rolled back).
 */
async function settleFirst(ctx: AuthContext, bookId: string) {
  await db.transaction(async (tx) => {
    await lockBook(tx, ctx, bookId);
    await settleQueue(tx, bookId);
  });
}

async function lockBook(tx: Tx, ctx: AuthContext, bookId: string) {
  await tx.execute(sql`SELECT id FROM library_books WHERE id = ${bookId} AND institution_id = ${ctx.institutionId} FOR UPDATE`);
  const [book] = await tx
    .select()
    .from(t.libraryBooks)
    .where(and(eq(t.libraryBooks.id, bookId), eq(t.libraryBooks.institutionId, ctx.institutionId)))
    .limit(1);
  if (!book) throw new NotFoundError('Book');
  return book;
}

/* -------------------------------- catalogue ------------------------------- */

export interface BookInput {
  title: string;
  authors?: string | null;
  isbn?: string | null;
  publisher?: string | null;
  edition?: string | null;
  publishedYear?: number | null;
  shelf?: string | null;
  totalCopies: number;
  subjectId?: string | null;
  departmentId?: string | null;
}

async function checkRefs(ctx: AuthContext, input: Pick<BookInput, 'subjectId' | 'departmentId'>) {
  if (input.subjectId) {
    const [s] = await db.select({ id: t.subjects.id }).from(t.subjects).where(and(eq(t.subjects.id, input.subjectId), eq(t.subjects.institutionId, ctx.institutionId)));
    if (!s) throw new AppError('That subject was not found.', 422, 'BAD_SUBJECT');
  }
  if (input.departmentId) {
    const [d] = await db.select({ id: t.departments.id }).from(t.departments).where(and(eq(t.departments.id, input.departmentId), eq(t.departments.institutionId, ctx.institutionId)));
    if (!d) throw new AppError('That department was not found.', 422, 'BAD_DEPARTMENT');
  }
}

export async function createBook(ctx: AuthContext, input: BookInput, meta: Meta) {
  requireManage(ctx);
  await checkRefs(ctx, input);
  const isbn = input.isbn ? normaliseIsbn(input.isbn) : null;
  if (input.isbn && !isbn) throw new AppError('That ISBN doesn’t look right (10 or 13 digits).', 422, 'BAD_ISBN');
  try {
    const [row] = await db
      .insert(t.libraryBooks)
      .values({
        institutionId: ctx.institutionId,
        title: input.title.trim(),
        authors: input.authors?.trim() || null,
        isbn,
        publisher: input.publisher?.trim() || null,
        edition: input.edition?.trim() || null,
        publishedYear: input.publishedYear ?? null,
        shelf: input.shelf?.trim() || null,
        totalCopies: input.totalCopies,
        subjectId: input.subjectId ?? null,
        departmentId: input.departmentId ?? null,
        createdById: ctx.userId,
      })
      .returning({ id: t.libraryBooks.id });
    await recordAudit(ctx, { action: 'LIBRARY_BOOK_ADDED', entityType: 'library_book', entityId: row!.id, after: { title: input.title, copies: input.totalCopies }, ...meta });
    return { id: row!.id };
  } catch (error) {
    if ((error as { cause?: { code?: string } }).cause?.code === '23505' || (error as { code?: string }).code === '23505') {
      throw new ConflictError('A book with this ISBN is already in the catalogue — add copies to it instead.');
    }
    throw error;
  }
}

export async function updateBook(ctx: AuthContext, bookId: string, input: Partial<BookInput> & { isActive?: boolean }, meta: Meta) {
  requireManage(ctx);
  await checkRefs(ctx, input);
  return db.transaction(async (tx) => {
    const book = await lockBook(tx, ctx, bookId);
    if (input.totalCopies !== undefined) {
      const c = (await counts(tx, [bookId])).get(bookId)!;
      if (input.totalCopies < c.loans + c.holds) {
        throw new ConflictError(`${c.loans} on loan and ${c.holds} held for collection — copies can’t be fewer than ${c.loans + c.holds}.`);
      }
    }
    const isbn = input.isbn !== undefined ? (input.isbn ? normaliseIsbn(input.isbn) : null) : undefined;
    if (input.isbn && !isbn) throw new AppError('That ISBN doesn’t look right (10 or 13 digits).', 422, 'BAD_ISBN');
    await tx
      .update(t.libraryBooks)
      .set({
        ...(input.title !== undefined ? { title: input.title.trim() } : {}),
        ...(input.authors !== undefined ? { authors: input.authors?.trim() || null } : {}),
        ...(isbn !== undefined ? { isbn } : {}),
        ...(input.publisher !== undefined ? { publisher: input.publisher?.trim() || null } : {}),
        ...(input.edition !== undefined ? { edition: input.edition?.trim() || null } : {}),
        ...(input.publishedYear !== undefined ? { publishedYear: input.publishedYear } : {}),
        ...(input.shelf !== undefined ? { shelf: input.shelf?.trim() || null } : {}),
        ...(input.totalCopies !== undefined ? { totalCopies: input.totalCopies } : {}),
        ...(input.subjectId !== undefined ? { subjectId: input.subjectId } : {}),
        ...(input.departmentId !== undefined ? { departmentId: input.departmentId } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        updatedAt: new Date(),
      })
      .where(eq(t.libraryBooks.id, book.id));
    // More copies may serve the queue.
    await settleQueue(tx, book.id);
    await recordAudit(ctx, { action: 'LIBRARY_BOOK_UPDATED', entityType: 'library_book', entityId: book.id, before: { copies: book.totalCopies, active: book.isActive }, after: { copies: input.totalCopies ?? book.totalCopies, active: input.isActive ?? book.isActive }, ...meta });
    return { id: book.id };
  });
}

export async function searchBooks(ctx: AuthContext, filters: { q?: string; limit?: number; includeInactive?: boolean } = {}) {
  requireLibrary(ctx);
  const conds = [eq(t.libraryBooks.institutionId, ctx.institutionId)];
  if (!filters.includeInactive) conds.push(eq(t.libraryBooks.isActive, true));
  const q = filters.q?.trim();
  if (q) {
    const like = likeEscape(q);
    conds.push(or(ilike(t.libraryBooks.title, like), ilike(t.libraryBooks.authors, like), ilike(t.libraryBooks.isbn, likeEscape(q.replace(/[\s-]/g, ''))), ilike(t.subjects.name, like), ilike(t.subjects.code, like))!);
  }
  const books = await db
    .select({ book: t.libraryBooks, subjectName: t.subjects.name, subjectCode: t.subjects.code })
    .from(t.libraryBooks)
    .leftJoin(t.subjects, eq(t.subjects.id, t.libraryBooks.subjectId))
    .where(and(...conds))
    .orderBy(asc(t.libraryBooks.title))
    .limit(Math.min(filters.limit ?? 60, 200));
  const ids = books.map((b) => b.book.id);
  const c = await counts(db, ids);
  const [mineLoans, mineRes] = ids.length
    ? await Promise.all([
        db.select({ bookId: t.libraryLoans.bookId }).from(t.libraryLoans).where(and(eq(t.libraryLoans.userId, ctx.userId), inArray(t.libraryLoans.bookId, ids), isNull(t.libraryLoans.returnedAt))),
        db
          .select({ bookId: t.libraryReservations.bookId, status: t.libraryReservations.status })
          .from(t.libraryReservations)
          .where(and(eq(t.libraryReservations.userId, ctx.userId), inArray(t.libraryReservations.bookId, ids), inArray(t.libraryReservations.status, ['WAITING', 'READY']))),
      ])
    : [[], []];
  const loanSet = new Set(mineLoans.map((l) => l.bookId));
  const resMap = new Map(mineRes.map((r) => [r.bookId, r.status]));
  return books.map(({ book, subjectName, subjectCode }) => {
    const k = c.get(book.id)!;
    return {
      id: book.id,
      title: book.title,
      authors: book.authors,
      isbn: book.isbn,
      publisher: book.publisher,
      edition: book.edition,
      publishedYear: book.publishedYear,
      shelf: book.shelf,
      isActive: book.isActive,
      subject: subjectName ? `${subjectCode} · ${subjectName}` : null,
      totalCopies: book.totalCopies,
      onLoan: k.loans,
      available: availableCopies(book.totalCopies, k.loans, k.holds),
      waiting: k.waiting,
      myLoan: loanSet.has(book.id),
      myReservation: (resMap.get(book.id) as 'WAITING' | 'READY' | undefined) ?? null,
    };
  });
}

/* ------------------------------- circulation ------------------------------ */

/** Find a borrower in the caller's own college by email or roll number. */
async function resolveBorrower(ctx: AuthContext, who: string) {
  const key = who.trim();
  const [u] = await db
    .select({ id: t.users.id, first: t.users.firstName, last: t.users.lastName, status: t.users.status })
    .from(t.users)
    .leftJoin(t.studentProfiles, eq(t.studentProfiles.userId, t.users.id))
    .where(and(eq(t.users.institutionId, ctx.institutionId), isNull(t.users.deletedAt), or(sql`lower(${t.users.email}) = lower(${key})`, sql`lower(${t.studentProfiles.rollNumber}) = lower(${key})`)))
    .limit(1);
  if (!u) throw new AppError('No one at your college has that email or roll number.', 404, 'BORROWER_NOT_FOUND');
  if (u.status !== 'ACTIVE') throw new ConflictError('That account is not active.');
  return u;
}

export async function issueLoan(ctx: AuthContext, input: { bookId: string; borrower: string }, meta: Meta) {
  requireManage(ctx);
  const borrower = await resolveBorrower(ctx, input.borrower);
  await settleFirst(ctx, input.bookId);
  const result = await db.transaction(async (tx) => {
    const book = await lockBook(tx, ctx, input.bookId);
    if (!book.isActive) throw new ConflictError('This book is withdrawn from circulation.');
    await settleQueue(tx, book.id);
    const [{ n: active }] = (await tx.select({ n: count() }).from(t.libraryLoans).where(and(eq(t.libraryLoans.userId, borrower.id), isNull(t.libraryLoans.returnedAt)))) as [{ n: number }];
    if (Number(active) >= LIBRARY_POLICY.maxActiveLoans) throw new ConflictError(`${borrower.first} already has ${LIBRARY_POLICY.maxActiveLoans} books out.`);
    const [hold] = await tx
      .select()
      .from(t.libraryReservations)
      .where(and(eq(t.libraryReservations.bookId, book.id), eq(t.libraryReservations.userId, borrower.id), eq(t.libraryReservations.status, 'READY')))
      .limit(1);
    const c = (await counts(tx, [book.id])).get(book.id)!;
    const free = availableCopies(book.totalCopies, c.loans, c.holds);
    if (!hold && free <= 0) {
      throw new ConflictError(c.holds > 0 ? 'The remaining copies are held for people in the reservation queue.' : 'No copies are available right now.');
    }
    const now = new Date();
    try {
      const [loan] = await tx
        .insert(t.libraryLoans)
        .values({ institutionId: ctx.institutionId, bookId: book.id, userId: borrower.id, issuedById: ctx.userId, issuedAt: now, dueAt: dueDateFrom(now) })
        .returning();
      if (hold) await tx.update(t.libraryReservations).set({ status: 'FULFILLED', closedAt: now }).where(eq(t.libraryReservations.id, hold.id));
      // A waiting reservation by the same person is fulfilled by this loan too.
      await tx
        .update(t.libraryReservations)
        .set({ status: 'FULFILLED', closedAt: now })
        .where(and(eq(t.libraryReservations.bookId, book.id), eq(t.libraryReservations.userId, borrower.id), eq(t.libraryReservations.status, 'WAITING')));
      await tx.insert(t.notifications).values({
        institutionId: ctx.institutionId,
        userId: borrower.id,
        title: `Borrowed: ${book.title}`,
        body: `Due back ${loan!.dueAt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}.`,
        priority: 'NORMAL',
        category: 'ACADEMIC',
        actionUrl: '/student/library?tab=loans',
        groupKey: `library:${book.id}`,
        sourceType: 'library_loan',
        sourceId: loan!.id,
      });
      return { loan: loan!, book };
    } catch (error) {
      if ((error as { cause?: { code?: string } }).cause?.code === '23505') throw new ConflictError(`${borrower.first} already has this book out.`);
      throw error;
    }
  });
  await recordAudit(ctx, { action: 'LIBRARY_LOAN_ISSUED', entityType: 'library_loan', entityId: result.loan.id, after: { bookId: result.book.id, borrowerId: borrower.id, dueAt: result.loan.dueAt.toISOString() }, ...meta });
  return { id: result.loan.id, dueAt: result.loan.dueAt, borrower: `${borrower.first} ${borrower.last}` };
}

export async function returnLoan(ctx: AuthContext, loanId: string, input: { waiveFine?: boolean; waiveReason?: string | null }, meta: Meta) {
  requireManage(ctx);
  if (input.waiveFine && (input.waiveReason ?? '').trim().length < 5) throw new AppError('Say why the fine is waived.', 422, 'REASON_REQUIRED');
  const out = await db.transaction(async (tx) => {
    const [loan] = await tx
      .select()
      .from(t.libraryLoans)
      .where(and(eq(t.libraryLoans.id, loanId), eq(t.libraryLoans.institutionId, ctx.institutionId)))
      .limit(1);
    if (!loan) throw new NotFoundError('Loan');
    if (loan.returnedAt) throw new ConflictError('This loan is already returned.');
    await lockBook(tx, ctx, loan.bookId);
    const now = new Date();
    await tx
      .update(t.libraryLoans)
      .set({ returnedAt: now, returnedToId: ctx.userId, fineWaived: !!input.waiveFine })
      .where(eq(t.libraryLoans.id, loan.id));
    await settleQueue(tx, loan.bookId, now);
    return { loan, fine: fineFor({ dueAt: loan.dueAt, returnedAt: now, fineWaived: !!input.waiveFine }, now), rawFine: fineFor({ dueAt: loan.dueAt, returnedAt: now }, now) };
  });
  await recordAudit(ctx, { action: 'LIBRARY_LOAN_RETURNED', entityType: 'library_loan', entityId: loanId, after: { fineInr: out.fine }, ...meta });
  if (input.waiveFine && out.rawFine > 0) {
    await recordAudit(ctx, { action: 'LIBRARY_FINE_WAIVED', entityType: 'library_loan', entityId: loanId, before: { fineInr: out.rawFine }, after: { reason: input.waiveReason?.trim() }, ...meta });
  }
  return { id: loanId, fineInr: out.fine };
}

export async function renewLoan(ctx: AuthContext, loanId: string, meta: Meta) {
  requireLibrary(ctx);
  await enforceRateLimit(keyFor('library:renew', ctx.userId), { limit: 30, windowSec: 3600 }, 'Too many renewals. Try again later.');
  const res = await db.transaction(async (tx) => {
    // Only the borrower renews online; staff use the desk.
    const [loan] = await tx
      .select()
      .from(t.libraryLoans)
      .where(and(eq(t.libraryLoans.id, loanId), eq(t.libraryLoans.userId, ctx.userId)))
      .limit(1);
    if (!loan) throw new NotFoundError('Loan');
    await tx.execute(sql`SELECT id FROM library_books WHERE id = ${loan.bookId} FOR UPDATE`);
    const [{ n: waiting }] = (await tx
      .select({ n: count() })
      .from(t.libraryReservations)
      .where(and(eq(t.libraryReservations.bookId, loan.bookId), inArray(t.libraryReservations.status, ['WAITING', 'READY'])))) as [{ n: number }];
    const check = canRenew(loan, Number(waiting));
    if (!check.ok) throw new ConflictError(RENEW_REASON[check.reason]);
    await tx.update(t.libraryLoans).set({ dueAt: check.newDueAt, renewals: loan.renewals + 1 }).where(eq(t.libraryLoans.id, loan.id));
    return { id: loan.id, dueAt: check.newDueAt, renewals: loan.renewals + 1 };
  });
  await recordAudit(ctx, { action: 'LIBRARY_LOAN_RENEWED', entityType: 'library_loan', entityId: loanId, after: { dueAt: res.dueAt.toISOString(), renewals: res.renewals }, ...meta });
  return res;
}

/* ------------------------------ reservations ------------------------------ */

export async function reserveBook(ctx: AuthContext, bookId: string) {
  requireLibrary(ctx);
  if (!ctx.permissions.has('library:borrow')) throw new ForbiddenError();
  await enforceRateLimit(keyFor('library:reserve', ctx.userId), { limit: 30, windowSec: 86_400 }, 'Too many reservations today.');
  await settleFirst(ctx, bookId);
  return db.transaction(async (tx) => {
    const book = await lockBook(tx, ctx, bookId);
    if (!book.isActive) throw new ConflictError('This book is withdrawn from circulation.');
    await settleQueue(tx, book.id);
    const c = (await counts(tx, [book.id])).get(book.id)!;
    if (availableCopies(book.totalCopies, c.loans, c.holds) > 0) {
      throw new ConflictError(`A copy is on the shelf${book.shelf ? ` (${book.shelf})` : ''} — you can borrow it at the desk now.`);
    }
    const [{ n: mine }] = (await tx
      .select({ n: count() })
      .from(t.libraryReservations)
      .where(and(eq(t.libraryReservations.userId, ctx.userId), inArray(t.libraryReservations.status, ['WAITING', 'READY'])))) as [{ n: number }];
    if (Number(mine) >= LIBRARY_POLICY.maxActiveReservations) throw new ConflictError(`You can reserve up to ${LIBRARY_POLICY.maxActiveReservations} books at a time.`);
    const [onLoan] = await tx.select({ id: t.libraryLoans.id }).from(t.libraryLoans).where(and(eq(t.libraryLoans.bookId, book.id), eq(t.libraryLoans.userId, ctx.userId), isNull(t.libraryLoans.returnedAt))).limit(1);
    if (onLoan) throw new ConflictError('You already have this book.');
    try {
      const [r] = await tx.insert(t.libraryReservations).values({ institutionId: ctx.institutionId, bookId: book.id, userId: ctx.userId }).returning({ id: t.libraryReservations.id });
      return { id: r!.id, position: c.waiting + 1 };
    } catch (error) {
      if ((error as { cause?: { code?: string } }).cause?.code === '23505') throw new ConflictError('You’ve already reserved this book.');
      throw error;
    }
  });
}

export async function cancelReservation(ctx: AuthContext, reservationId: string) {
  requireLibrary(ctx);
  return db.transaction(async (tx) => {
    const [r] = await tx
      .select()
      .from(t.libraryReservations)
      .where(and(eq(t.libraryReservations.id, reservationId), eq(t.libraryReservations.userId, ctx.userId)))
      .limit(1);
    if (!r) throw new NotFoundError('Reservation');
    if (r.status !== 'WAITING' && r.status !== 'READY') throw new ConflictError('This reservation is already closed.');
    await tx.execute(sql`SELECT id FROM library_books WHERE id = ${r.bookId} FOR UPDATE`);
    await tx.update(t.libraryReservations).set({ status: 'CANCELLED', closedAt: new Date() }).where(eq(t.libraryReservations.id, r.id));
    if (r.status === 'READY') await settleQueue(tx, r.bookId); // the held copy goes to the next person
    return { id: r.id };
  });
}

/* ------------------------------- read models ------------------------------ */

export async function myLibrary(ctx: AuthContext) {
  requireLibrary(ctx);
  const now = new Date();
  const [loans, reservations] = await Promise.all([
    db
      .select({ loan: t.libraryLoans, title: t.libraryBooks.title, authors: t.libraryBooks.authors, shelf: t.libraryBooks.shelf })
      .from(t.libraryLoans)
      .innerJoin(t.libraryBooks, eq(t.libraryBooks.id, t.libraryLoans.bookId))
      .where(and(eq(t.libraryLoans.userId, ctx.userId), or(isNull(t.libraryLoans.returnedAt), sql`${t.libraryLoans.returnedAt} > now() - interval '120 days'`)))
      .orderBy(sql`${t.libraryLoans.returnedAt} IS NOT NULL`, asc(t.libraryLoans.dueAt))
      .limit(50),
    db
      .select({ r: t.libraryReservations, title: t.libraryBooks.title, shelf: t.libraryBooks.shelf })
      .from(t.libraryReservations)
      .innerJoin(t.libraryBooks, eq(t.libraryBooks.id, t.libraryReservations.bookId))
      .where(and(eq(t.libraryReservations.userId, ctx.userId), or(inArray(t.libraryReservations.status, ['WAITING', 'READY']), sql`${t.libraryReservations.closedAt} > now() - interval '30 days'`)))
      .orderBy(desc(t.libraryReservations.createdAt))
      .limit(30),
  ]);
  // Queue position = rank among WAITING reservations for the same book (one query).
  const positions = new Map<string, number>();
  const waitingIds = reservations.filter((x) => x.r.status === 'WAITING').map((x) => x.r.id);
  if (waitingIds.length) {
    const bookIds = [...new Set(reservations.filter((x) => x.r.status === 'WAITING').map((x) => x.r.bookId))];
    const ranked = await db.execute<{ id: string; pos: number }>(sql`
      SELECT id, pos FROM (
        SELECT id, row_number() OVER (PARTITION BY book_id ORDER BY created_at, id)::int AS pos
          FROM library_reservations
         WHERE status = 'WAITING' AND book_id = ANY(${uuidArray(bookIds)})
      ) q WHERE id = ANY(${uuidArray(waitingIds)})`);
    for (const r of ranked.rows) positions.set(r.id, Number(r.pos));
  }
  const waitingByBook = new Map<string, number>();
  const openBookIds = [...new Set(loans.filter((l) => !l.loan.returnedAt).map((l) => l.loan.bookId))];
  if (openBookIds.length) {
    const rows = await db
      .select({ bookId: t.libraryReservations.bookId, n: count() })
      .from(t.libraryReservations)
      .where(and(inArray(t.libraryReservations.bookId, openBookIds), inArray(t.libraryReservations.status, ['WAITING', 'READY'])))
      .groupBy(t.libraryReservations.bookId);
    for (const r of rows) waitingByBook.set(r.bookId, Number(r.n));
  }
  return {
    policy: LIBRARY_POLICY,
    loans: loans.map(({ loan, title, authors, shelf }) => {
      const renew = canRenew(loan, waitingByBook.get(loan.bookId) ?? 0, now);
      return {
        id: loan.id,
        bookId: loan.bookId,
        title,
        authors,
        shelf,
        issuedAt: loan.issuedAt,
        dueAt: loan.dueAt,
        returnedAt: loan.returnedAt,
        renewals: loan.renewals,
        overdue: !loan.returnedAt && loan.dueAt < now,
        fineInr: fineFor(loan, now),
        canRenew: renew.ok,
        renewBlockedReason: renew.ok ? null : renew.reason === 'RETURNED' ? null : RENEW_REASON[renew.reason],
      };
    }),
    reservations: reservations.map(({ r, title, shelf }) => ({
      id: r.id,
      bookId: r.bookId,
      title,
      shelf,
      // A hold that lapsed but hasn't been settled yet is shown as expired.
      status: (r.status === 'READY' && r.readyUntil && r.readyUntil < now ? 'EXPIRED' : r.status) as 'WAITING' | 'READY' | 'FULFILLED' | 'EXPIRED' | 'CANCELLED',
      createdAt: r.createdAt,
      readyUntil: r.status === 'READY' ? r.readyUntil : null,
      position: positions.get(r.id) ?? null,
    })),
  };
}

export async function libraryDesk(ctx: AuthContext) {
  requireManage(ctx);
  const now = new Date();
  const [books, activeLoans, waiting] = await Promise.all([
    db
      .select({ n: count(), copies: sql<number>`coalesce(sum(${t.libraryBooks.totalCopies}), 0)::int` })
      .from(t.libraryBooks)
      .where(and(eq(t.libraryBooks.institutionId, ctx.institutionId), eq(t.libraryBooks.isActive, true))),
    db
      .select({
        loan: t.libraryLoans,
        title: t.libraryBooks.title,
        first: t.users.firstName,
        last: t.users.lastName,
        email: t.users.email,
        roll: t.studentProfiles.rollNumber,
      })
      .from(t.libraryLoans)
      .innerJoin(t.libraryBooks, eq(t.libraryBooks.id, t.libraryLoans.bookId))
      .innerJoin(t.users, eq(t.users.id, t.libraryLoans.userId))
      .leftJoin(t.studentProfiles, eq(t.studentProfiles.userId, t.libraryLoans.userId))
      .where(and(eq(t.libraryLoans.institutionId, ctx.institutionId), isNull(t.libraryLoans.returnedAt)))
      .orderBy(asc(t.libraryLoans.dueAt))
      .limit(300),
    db
      .select({ n: count() })
      .from(t.libraryReservations)
      .where(and(eq(t.libraryReservations.institutionId, ctx.institutionId), inArray(t.libraryReservations.status, ['WAITING', 'READY']))),
  ]);
  const loans = activeLoans.map((l) => ({
    id: l.loan.id,
    title: l.title,
    borrower: `${l.first} ${l.last}`,
    borrowerRef: l.roll ?? l.email,
    issuedAt: l.loan.issuedAt,
    dueAt: l.loan.dueAt,
    overdue: l.loan.dueAt < now,
    fineInr: fineFor(l.loan, now),
  }));
  return {
    stats: {
      titles: Number(books[0]?.n ?? 0),
      copies: Number(books[0]?.copies ?? 0),
      onLoan: loans.length,
      overdue: loans.filter((l) => l.overdue).length,
      reservations: Number(waiting[0]?.n ?? 0),
    },
    loans,
  };
}

/** For "Your Day": books due today or tomorrow, and overdue ones. */
export async function loansDueSoon(ctx: AuthContext) {
  if (!isEnabled(ctx.featureFlags, 'library_enabled')) return [];
  const rows = await db
    .select({ id: t.libraryLoans.id, title: t.libraryBooks.title, dueAt: t.libraryLoans.dueAt })
    .from(t.libraryLoans)
    .innerJoin(t.libraryBooks, eq(t.libraryBooks.id, t.libraryLoans.bookId))
    .where(and(eq(t.libraryLoans.userId, ctx.userId), isNull(t.libraryLoans.returnedAt), sql`${t.libraryLoans.dueAt} < now() + interval '2 days'`))
    .orderBy(asc(t.libraryLoans.dueAt))
    .limit(5);
  return rows;
}

/** Everything the library holds about a person, for the data export. */
export async function exportLibraryData(userId: string) {
  const [loans, reservations, saves] = await Promise.all([
    db
      .select({ title: t.libraryBooks.title, issuedAt: t.libraryLoans.issuedAt, dueAt: t.libraryLoans.dueAt, returnedAt: t.libraryLoans.returnedAt, renewals: t.libraryLoans.renewals, fineWaived: t.libraryLoans.fineWaived })
      .from(t.libraryLoans)
      .innerJoin(t.libraryBooks, eq(t.libraryBooks.id, t.libraryLoans.bookId))
      .where(eq(t.libraryLoans.userId, userId)),
    db
      .select({ title: t.libraryBooks.title, status: t.libraryReservations.status, createdAt: t.libraryReservations.createdAt, closedAt: t.libraryReservations.closedAt })
      .from(t.libraryReservations)
      .innerJoin(t.libraryBooks, eq(t.libraryBooks.id, t.libraryReservations.bookId))
      .where(eq(t.libraryReservations.userId, userId)),
    db
      .select({ title: t.resources.title, savedAt: t.resourceSaves.createdAt })
      .from(t.resourceSaves)
      .innerJoin(t.resources, eq(t.resources.id, t.resourceSaves.resourceId))
      .where(eq(t.resourceSaves.userId, userId)),
  ]);
  return {
    loans: loans.map((l) => ({ ...l, fineInr: fineFor({ dueAt: l.dueAt, returnedAt: l.returnedAt, fineWaived: l.fineWaived }) })),
    reservations,
    savedResources: saves,
  };
}
