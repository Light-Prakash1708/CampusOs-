import { FeatureGate } from '@/components/layout/FeatureGate';

export default function Layout({ children }: { children: React.ReactNode }) {
  return <FeatureGate flag="gamification_enabled">{children}</FeatureGate>;
}
