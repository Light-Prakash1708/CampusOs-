import { PortalLayout } from '@/components/layout/PortalLayout';

export default function StudentLayout({ children }: { children: React.ReactNode }) {
  return <PortalLayout portal="student">{children}</PortalLayout>;
}
