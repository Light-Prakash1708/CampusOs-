import { z } from 'zod';
import { ok, parseBody, withAuth } from '@/lib/api';
import { metaFrom } from '@/lib/http';
import { issueLoan } from '@/services/library';

const Body = z.object({ bookId: z.string().uuid(), borrower: z.string().trim().min(2, 'Enter an email or roll number').max(200) });

/** Issue a book at the desk (library staff). The borrower is found in your own college only. */
export const POST = withAuth('library:manage', async (request, { user }) => {
  const input = await parseBody(request, Body);
  return ok(await issueLoan(user, input, metaFrom(request)), { status: 201 });
});
