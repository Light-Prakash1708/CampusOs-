import { PortalLayout } from '@/components/layout/PortalLayout';
import { requireAuth } from '@/lib/auth/context';

/**
 * Organiser console — shared by students (club leads), faculty and admins.
 * Rendered inside the caller's own portal shell.
 */
export default async function OrganizeLayout({ children }: { children: React.ReactNode }) {
  const user = await requireAuth();
  return <PortalLayout portal={user.portal}>{children}</PortalLayout>;
}
