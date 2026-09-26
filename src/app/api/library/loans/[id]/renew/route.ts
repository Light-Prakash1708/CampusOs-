import { idParam, ok, withAuth } from '@/lib/api';
import { metaFrom } from '@/lib/http';
import { renewLoan } from '@/services/library';

/** Renew my own loan (not overdue, under the limit, nobody waiting). */
export const POST = withAuth('library:borrow', async (request, { user, params }) => ok(await renewLoan(user, idParam(params.id, 'That loan'), metaFrom(request))));
