import { ok, parseBody, withAuth } from '@/lib/api';
import { metaFrom } from '@/lib/http';
import { createBook, searchBooks } from '@/services/library';
import { BookBody } from '../_schema';

/** Catalogue search with live availability. */
export const GET = withAuth('library:borrow', async (request, { user }) => {
  const q = new URL(request.url).searchParams.get('q')?.slice(0, 120) ?? undefined;
  return ok(await searchBooks(user, { q }));
});

/** Add a title to the catalogue (library staff). */
export const POST = withAuth('library:manage', async (request, { user }) => {
  const input = await parseBody(request, BookBody);
  return ok(await createBook(user, input, metaFrom(request)), { status: 201 });
});
