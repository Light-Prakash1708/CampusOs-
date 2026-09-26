import { PageSkeleton } from '@/components/campus/PageSkeleton';

export default function Loading() {
  return <PageSkeleton stats={5} label="Loading the library desk" />;
}
