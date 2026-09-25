import { Skeleton, SkeletonRows } from '@/components/ui';

export default function WorkloadLoading() {
  return (
    <div>
      <Skeleton className="h-7 w-40" />
      <Skeleton className="mt-2 h-4 w-80" />
      <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[92px] w-full rounded-xl" />
        ))}
      </div>
      <Skeleton className="mt-5 h-[86px] w-full rounded-xl" />
      <Skeleton className="mt-6 h-4 w-20" />
      <Skeleton className="mt-3 h-[190px] w-full rounded-xl" />
      <Skeleton className="mt-6 h-4 w-48" />
      <div className="mt-3">
        <SkeletonRows rows={4} />
      </div>
    </div>
  );
}
