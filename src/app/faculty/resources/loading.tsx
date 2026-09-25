import { Skeleton, SkeletonRows } from '@/components/ui';

export default function ResourcesLoading() {
  return (
    <div>
      <Skeleton className="h-7 w-36" />
      <Skeleton className="mt-2 h-4 w-96" />
      <Skeleton className="mt-5 h-4 w-40" />
      <Skeleton className="mt-3 h-[110px] w-full rounded-xl" />
      <Skeleton className="mt-6 h-4 w-32" />
      <div className="mt-3">
        <SkeletonRows rows={5} />
      </div>
    </div>
  );
}
