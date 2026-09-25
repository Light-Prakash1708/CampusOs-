import { notFound, redirect } from 'next/navigation';
import { requireAuth } from '@/lib/auth/context';
import { getEvent } from '@/services/events';

export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * /events/[id] — the link used in notifications, calendar files and shares.
 * Students see the event page; staff who manage the event see the organiser
 * view, and other staff land on their events console.
 */
export default async function EventEntry({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireAuth();
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();
  if (user.portal === 'student') redirect(`/student/events/${id}`);
  // Staff: the organiser view if they manage it; otherwise their events console.
  const manages = await getEvent(user, id).then((d) => d.canManage).catch(() => false);
  if (manages) redirect(`/organize/${id}`);
  if (user.permissions.has('event:approve')) redirect('/admin/events');
  if (user.permissions.has('event:create')) redirect('/organize');
  redirect(`/${user.portal}`);
}
