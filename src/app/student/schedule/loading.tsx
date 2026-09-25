import { Card, CardBody, Skeleton } from '@/components/ui';

export default function ScheduleLoading() {
  return (
    <>
      <div className="mb-5 flex items-start justify-between gap-3">
        <div className="space-y-2">
          <Skeleton className="h-6 w-44" />
          <Skeleton className="h-3.5 w-64" />
        </div>
        <Skeleton className="h-9 w-40 rounded-md" />
      </div>

      <Skeleton className="mb-4 h-3.5 w-56" />

      {/* Desktop grid */}
      <Card className="hidden overflow-hidden md:block">
        <div className="grid" style={{ gridTemplateColumns: '84px repeat(6, minmax(0, 1fr))' }}>
          {Array.from({ length: 7 * 7 }).map((_, i) => (
            <div key={i} className="border-b border-l border-[hsl(var(--border))] p-2">
              <Skeleton className="h-12 w-full" />
            </div>
          ))}
        </div>
      </Card>

      {/* Mobile day list */}
      <div className="space-y-4 md:hidden">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i}>
            <CardBody className="space-y-3">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-11 w-full" />
              <Skeleton className="h-11 w-full" />
            </CardBody>
          </Card>
        ))}
      </div>
    </>
  );
}
