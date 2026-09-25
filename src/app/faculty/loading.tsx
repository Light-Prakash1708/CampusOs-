import { Skeleton, SkeletonRows } from '@/components/ui';

export default function FacultyLoading() {
  return (
    <div>
      <div className="mb-5">
        <Skeleton className="h-7 w-56" />
        <Skeleton className="mt-2 h-4 w-80" />
      </div>
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[92px] w-full rounded-xl" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Skeleton className="mb-3 h-4 w-32" />
          <SkeletonRows rows={5} />
        </div>
        <div>
          <Skeleton className="mb-3 h-4 w-32" />
          <SkeletonRows rows={3} />
        </div>
      </div>
    </div>
  );
}
