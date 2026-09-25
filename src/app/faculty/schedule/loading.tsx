import { Skeleton } from '@/components/ui';

export default function ScheduleLoading() {
  return (
    <div>
      <Skeleton className="h-7 w-44" />
      <Skeleton className="mt-2 h-4 w-64" />
      <Skeleton className="mt-5 h-4 w-24" />
      <Skeleton className="mt-3 h-[340px] w-full rounded-xl" />
      <Skeleton className="mt-6 h-4 w-24" />
      <div className="mt-3 space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-[150px] w-full rounded-xl" />
        ))}
      </div>
    </div>
  );
}
