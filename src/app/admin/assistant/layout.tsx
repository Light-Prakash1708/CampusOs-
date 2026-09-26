import { FeatureGate } from '@/components/layout/FeatureGate';

export default function Layout({ children }: { children: React.ReactNode }) {
  return <FeatureGate flag="ai_assistant_enabled">{children}</FeatureGate>;
}
