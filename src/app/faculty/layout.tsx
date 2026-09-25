import { PortalLayout } from '@/components/layout/PortalLayout';

export default function FacultyLayout({ children }: { children: React.ReactNode }) {
  return <PortalLayout portal="faculty">{children}</PortalLayout>;
}
