import { PageSkeleton } from '@/components/campus/PageSkeleton';

export default function Loading() {
  return <PageSkeleton stats={0} cards={2} label="Loading the assistant" />;
}
