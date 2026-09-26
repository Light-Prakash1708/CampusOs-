import { ok, withAuth } from '@/lib/api';
import { searchJoinableInstitutions } from '@/services/membership';

/** Colleges accepting join requests (public directory information only). */
export const GET = withAuth(null, async (request) => {
  const q = new URL(request.url).searchParams.get('q') ?? '';
  return ok(await searchJoinableInstitutions(q));
});
