import { Skeleton, SkeletonRows } from '@/components/ui';

export default function LeaveLoading() {
  return (
    <div>
      <Skeleton className="h-7 w-28" />
      <Skeleton className="mt-2 h-4 w-[420px]" />
      <Skeleton className="mt-5 h-4 w-28" />
      <Skeleton className="mt-3 h-[380px] w-full rounded-xl" />
      <Skeleton className="mt-6 h-4 w-32" />
      <div className="mt-3">
        <SkeletonRows rows={3} className="[&>div]:h-24" />
      </div>
    </div>
  );
}
