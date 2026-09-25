import { Skeleton, SkeletonRows } from '@/components/ui';

export default function AssignmentDetailLoading() {
  return (
    <div>
      <Skeleton className="h-4 w-24" />
      <Skeleton className="mt-2 h-7 w-80" />
      <Skeleton className="mt-2 h-4 w-96" />
      <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[92px] w-full rounded-xl" />
        ))}
      </div>
      <Skeleton className="mt-6 h-4 w-28" />
      <div className="mt-3">
        <SkeletonRows rows={6} className="[&>div]:h-20" />
      </div>
    </div>
  );
}
