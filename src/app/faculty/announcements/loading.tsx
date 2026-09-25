import { Skeleton, SkeletonRows } from '@/components/ui';

export default function AnnouncementsLoading() {
  return (
    <div>
      <Skeleton className="h-7 w-48" />
      <Skeleton className="mt-2 h-4 w-80" />
      <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[92px] w-full rounded-xl" />
        ))}
      </div>
      <div className="mt-6">
        <SkeletonRows rows={4} className="[&>div]:h-28" />
      </div>
    </div>
  );
}
