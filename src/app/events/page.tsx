import { redirect } from 'next/navigation';
import { requireAuth } from '@/lib/auth/context';

export const dynamic = 'force-dynamic';

/**
 * /events — a stable, shareable address. Students land on discovery (filters
 * kept); organisers and moderators land on the tools their role has.
 */
export default async function EventsEntry({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireAuth();
  const sp = await searchParams;
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) if (typeof v === 'string' && v) qs.set(k, v);
  if (user.portal === 'student') redirect(`/student/events${qs.size ? `?${qs}` : ''}`);
  if (user.permissions.has('event:approve')) redirect('/admin/events');
  if (user.permissions.has('event:create')) redirect('/organize');
  redirect(`/${user.portal}`);
}
