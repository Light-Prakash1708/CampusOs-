/**
 * LIBRARY RULES (pure — unit-tested)
 * ---------------------------------------------------------------------------
 * The circulation policy lives here so the desk, the student page and the
 * tests agree. Values are CampusOS defaults; they are shown to students on the
 * library page, so nothing is a surprise.
 */

export const LIBRARY_POLICY = {
  loanDays: 14,
  maxRenewals: 2,
  /** Active loans per borrower. */
  maxActiveLoans: 5,
  maxActiveReservations: 5,
  /** A copy is held this long for the next person in the queue. */
  holdDays: 3,
  /** Estimated fine per day overdue, in rupees. Payable at the desk; CampusOS takes no payments. */
  finePerDayInr: 2,
  /** Fines stop growing at this amount. */
  maxFineInr: 200,
} as const;

const DAY = 86_400_000;

/** Whole days late (0 if on time). Counts started days, so 1 minute late on the due day is 0, the next day is 1. */
export function daysOverdue(dueAt: Date, at: Date): number {
  const late = at.getTime() - dueAt.getTime();
  return late <= 0 ? 0 : Math.ceil(late / DAY);
}

export function fineFor(loan: { dueAt: Date; returnedAt: Date | null; fineWaived?: boolean }, now: Date = new Date()): number {
  if (loan.fineWaived) return 0;
  const days = daysOverdue(loan.dueAt, loan.returnedAt ?? now);
  return Math.min(days * LIBRARY_POLICY.finePerDayInr, LIBRARY_POLICY.maxFineInr);
}

export function availableCopies(totalCopies: number, activeLoans: number, readyHolds: number): number {
  return Math.max(0, totalCopies - activeLoans - readyHolds);
}

export type RenewalCheck = { ok: true; newDueAt: Date } | { ok: false; reason: 'OVERDUE' | 'LIMIT' | 'RESERVED' | 'RETURNED' };

/**
 * Renewing extends from the current due date (not from today), so renewing
 * early never costs days. Not allowed once overdue, after the limit, or when
 * someone is waiting for the book.
 */
export function canRenew(
  loan: { dueAt: Date; renewals: number; returnedAt: Date | null },
  othersWaiting: number,
  now: Date = new Date(),
): RenewalCheck {
  if (loan.returnedAt) return { ok: false, reason: 'RETURNED' };
  if (loan.dueAt.getTime() < now.getTime()) return { ok: false, reason: 'OVERDUE' };
  if (loan.renewals >= LIBRARY_POLICY.maxRenewals) return { ok: false, reason: 'LIMIT' };
  if (othersWaiting > 0) return { ok: false, reason: 'RESERVED' };
  return { ok: true, newDueAt: new Date(loan.dueAt.getTime() + LIBRARY_POLICY.loanDays * DAY) };
}

export const RENEW_REASON: Record<Exclude<RenewalCheck, { ok: true }>['reason'], string> = {
  OVERDUE: 'This book is overdue. Please return it at the library desk.',
  LIMIT: `You’ve already renewed it ${LIBRARY_POLICY.maxRenewals} times.`,
  RESERVED: 'Someone is waiting for this book, so it can’t be renewed.',
  RETURNED: 'This book has already been returned.',
};

export function dueDateFrom(issuedAt: Date): Date {
  return new Date(issuedAt.getTime() + LIBRARY_POLICY.loanDays * DAY);
}

export function holdUntil(readyAt: Date): Date {
  return new Date(readyAt.getTime() + LIBRARY_POLICY.holdDays * DAY);
}

/** Loose ISBN-10/13 check (digits, optional X, hyphens/spaces ignored). */
export function normaliseIsbn(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = raw.replace(/[\s-]/g, '').toUpperCase();
  return /^(\d{9}[\dX]|\d{13})$/.test(s) ? s : null;
}
