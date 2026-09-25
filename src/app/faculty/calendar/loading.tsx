import { Skeleton, SkeletonRows } from '@/components/ui';

export default function CalendarLoading() {
  return (
    <div>
      <Skeleton className="h-7 w-32" />
      <Skeleton className="mt-2 h-4 w-96" />
      <Skeleton className="mt-5 h-4 w-40" />
      <Skeleton className="mt-3 h-[520px] w-full rounded-xl" />
      <Skeleton className="mt-6 h-4 w-40" />
      <div className="mt-3">
        <SkeletonRows rows={4} />
      </div>
    </div>
  );
}
