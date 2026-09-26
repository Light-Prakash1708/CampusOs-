import { idParam, ok, withAuth } from '@/lib/api';
import { reserveBook } from '@/services/library';

/** Join the queue for a book with no copy on the shelf. */
export const POST = withAuth('library:borrow', async (_request, { user, params }) => ok(await reserveBook(user, idParam(params.id, 'That book')), { status: 201 }));
