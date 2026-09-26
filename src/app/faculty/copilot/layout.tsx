import { FeatureGate } from '@/components/layout/FeatureGate';

export default function Layout({ children }: { children: React.ReactNode }) {
  return <FeatureGate flag="teacher_copilot_enabled">{children}</FeatureGate>;
}
