import { Card, CardBody, Skeleton, SkeletonRows } from '@/components/ui';

export default function AttendanceLoading() {
  return (
    <>
      <div className="mb-5 space-y-2">
        <Skeleton className="h-6 w-36" />
        <Skeleton className="h-3.5 w-80 max-w-full" />
      </div>

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="rounded-xl border border-[hsl(var(--border))] bg-surface-raised p-4"
          >
            <Skeleton className="h-3 w-28" />
            <Skeleton className="mt-2.5 h-7 w-20" />
            <Skeleton className="mt-2 h-3 w-32" />
          </div>
        ))}
      </div>

      <Skeleton className="mb-3 h-3.5 w-24" />
      <Card>
        <CardBody>
          <SkeletonRows rows={5} />
        </CardBody>
      </Card>
    </>
  );
}
