import { redirect } from 'next/navigation';
import { PortalLayout } from '@/components/layout/PortalLayout';
import { requireAuth } from '@/lib/auth/context';

/**
 * Tools & Utilities lives at /tools (not /student/tools) so tools can later
 * serve more than one portal. Today every tool is a student tool, so other
 * portals are sent to their own home instead of an empty page.
 */
export default async function ToolsLayout({ children }: { children: React.ReactNode }) {
  const user = await requireAuth();
  if (user.portal !== 'student') redirect(`/${user.portal}`);
  return <PortalLayout portal="student">{children}</PortalLayout>;
}
