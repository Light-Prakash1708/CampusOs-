/**
 * DEMO DATA — library catalogue (fictional).
 *
 * Invented titles and authors, all shelved under "Demo shelf" so nobody mistakes
 * them for a real collection. One book is on loan to the demo student and one
 * title has every copy out, so renewals and reservations have something to show.
 */
import { eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as s from '../src/lib/db/schema';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DB = NodePgDatabase<any>;
const DAY = 86_400_000;

const BOOKS = [
  { title: 'Foundations of Financial Accounting', authors: 'R. Banerjee, S. Dutta', publisher: 'Hooghly Press (demo)', year: 2021, copies: 4 },
  { title: 'Marketing in Emerging Markets', authors: 'A. Sen', publisher: 'Ganges Books (demo)', year: 2022, copies: 3 },
  { title: 'Business Statistics: A Practical Course', authors: 'P. Chakraborty', publisher: 'Hooghly Press (demo)', year: 2020, copies: 2 },
  { title: 'Organisational Behaviour Casebook', authors: 'M. Ghosh, T. Roy', publisher: 'Ganges Books (demo)', year: 2023, copies: 1 },
  { title: 'Corporate Finance Essentials', authors: 'D. Mukherjee', publisher: 'Sundarban Publishing (demo)', year: 2019, copies: 2 },
  { title: 'Managerial Economics Workbook', authors: 'K. Bose', publisher: 'Sundarban Publishing (demo)', year: 2022, copies: 3 },
] as const;

export async function seedLibrary(db: DB, ctx: { institutionId: string; adminUserId: string; demoStudentUserId: string; otherStudentUserId: string }) {
  console.log('  · library catalogue (demo)…');
  await db.delete(s.libraryBooks).where(eq(s.libraryBooks.institutionId, ctx.institutionId));
  const rows = await db
    .insert(s.libraryBooks)
    .values(
      BOOKS.map((b, i) => ({
        institutionId: ctx.institutionId,
        title: b.title,
        authors: b.authors,
        publisher: b.publisher,
        publishedYear: b.year,
        shelf: `Demo shelf · Rack ${String.fromCharCode(65 + i)}`,
        totalCopies: b.copies,
        createdById: ctx.adminUserId,
      })),
    )
    .returning({ id: s.libraryBooks.id, title: s.libraryBooks.title });
  const now = Date.now();
  await db.insert(s.libraryLoans).values([
    // The demo student's book, due in three days (renewable).
    { institutionId: ctx.institutionId, bookId: rows[0]!.id, userId: ctx.demoStudentUserId, issuedById: ctx.adminUserId, issuedAt: new Date(now - 11 * DAY), dueAt: new Date(now + 3 * DAY) },
    // The only copy of the casebook is out, so it can be reserved.
    { institutionId: ctx.institutionId, bookId: rows[3]!.id, userId: ctx.otherStudentUserId, issuedById: ctx.adminUserId, issuedAt: new Date(now - 4 * DAY), dueAt: new Date(now + 10 * DAY) },
  ]);
}
