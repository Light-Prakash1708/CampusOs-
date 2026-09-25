import { ok, withAuth } from '@/lib/api';
import { myLibrary } from '@/services/library';

/** My loans (with due dates and estimated fines) and reservations. */
export const GET = withAuth('library:borrow', async (_request, { user }) => ok(await myLibrary(user)));
