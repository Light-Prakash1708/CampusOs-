import { Skeleton, SkeletonRows } from '@/components/ui';

export default function AttendanceLoading() {
  return (
    <div>
      <Skeleton className="h-7 w-40" />
      <Skeleton className="mt-2 h-4 w-72" />
      <Skeleton className="mt-5 h-[104px] w-full rounded-xl" />
      <Skeleton className="mt-5 h-4 w-32" />
      <div className="mt-3 rounded-xl border border-[hsl(var(--border))] bg-surface-raised p-4">
        <Skeleton className="h-9 w-full" />
        <div className="mt-3">
          <SkeletonRows rows={8} />
        </div>
      </div>
    </div>
  );
}
