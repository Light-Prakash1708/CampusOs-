import { ok, parseBody, withAuth } from '@/lib/api';
import { idParam, metaFrom } from '@/lib/http';
import { updateBook } from '@/services/library';
import { BookPatch } from '../../_schema';

export const PATCH = withAuth('library:manage', async (request, { user, params }) => {
  const input = await parseBody(request, BookPatch);
  return ok(await updateBook(user, idParam(params.id, 'That book'), input, metaFrom(request)));
});
