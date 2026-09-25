import { Skeleton, SkeletonRows } from '@/components/ui';

export default function AssignmentsLoading() {
  return (
    <div>
      <Skeleton className="h-7 w-44" />
      <Skeleton className="mt-2 h-4 w-72" />
      <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[92px] w-full rounded-xl" />
        ))}
      </div>
      <div className="mt-6">
        <SkeletonRows rows={5} className="[&>div]:h-24" />
      </div>
    </div>
  );
}
