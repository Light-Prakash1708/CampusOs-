import { notFound, redirect } from 'next/navigation';
import { requireAuth } from '@/lib/auth/context';

export const dynamic = 'force-dynamic';

/**
 * /announcements/[id] — the portal-neutral link used in notifications and
 * emails. Sends each person to where their portal shows the notice. Access is
 * still decided by that page (a notice is only listed for its recipients).
 */
export default async function AnnouncementLink({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireAuth();
  const { id } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) notFound();
  if (user.portal === 'admin') redirect(`/admin/communications/${id}`);
  redirect(`/${user.portal}/announcements#${id}`);
}
