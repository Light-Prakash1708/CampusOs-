import { ok, parseBody, withAuth } from '@/lib/api';
import { metaFrom } from '@/lib/http';
import { listForStudent, submitOpportunity } from '@/services/opportunities';
import { OpportunityBody } from './_schema';

/** Published opportunities at my college, with my skill match and my tracker status. */
export const GET = withAuth('opportunity:view', async (request, { user }) => {
  const sp = new URL(request.url).searchParams;
  return ok(await listForStudent(user, { kind: sp.get('kind') ?? undefined, q: sp.get('q')?.slice(0, 120) ?? undefined, tracked: sp.get('tracked') === '1' }));
});

/** Submit one (students: waits for approval; placement staff: published as the college). */
export const POST = withAuth('opportunity:submit', async (request, { user }) => {
  const input = await parseBody(request, OpportunityBody);
  return ok(await submitOpportunity(user, input, metaFrom(request)), { status: 201 });
});
