import { FeatureGate } from '@/components/layout/FeatureGate';

export default function Layout({ children }: { children: React.ReactNode }) {
  return <FeatureGate flag="advanced_analytics_enabled">{children}</FeatureGate>;
}
