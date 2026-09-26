import { redirect } from 'next/navigation';
import { requireAuth } from '@/lib/auth/context';

export const dynamic = 'force-dynamic';

/** /changes/[id] — notification link for a timetable change; opens the right schedule view. */
export default async function ChangeLink() {
  const user = await requireAuth();
  redirect(user.portal === 'admin' ? '/admin/changes' : `/${user.portal}/schedule`);
}
