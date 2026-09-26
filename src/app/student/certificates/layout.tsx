import { FeatureGate } from '@/components/layout/FeatureGate';

export default function Layout({ children }: { children: React.ReactNode }) {
  return <FeatureGate flag="events_enabled">{children}</FeatureGate>;
}
