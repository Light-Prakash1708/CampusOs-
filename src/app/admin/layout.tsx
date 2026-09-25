import { PortalLayout } from '@/components/layout/PortalLayout';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <PortalLayout portal="admin">{children}</PortalLayout>;
}
