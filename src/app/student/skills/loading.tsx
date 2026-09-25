import { Card, CardBody, Skeleton } from '@/components/ui';

export default function SkillsLoading() {
  return (
    <>
      <div className="mb-5 space-y-2">
        <Skeleton className="h-6 w-44" />
        <Skeleton className="h-3.5 w-full max-w-lg" />
      </div>

      <Card className="mb-6">
        <CardBody className="space-y-4">
          <Skeleton className="h-4 w-56" />
          <div className="grid gap-3 sm:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-[86px] w-full rounded-xl" />
            ))}
          </div>
          <Skeleton className="h-2 w-full rounded-full" />
          <Skeleton className="h-14 w-full rounded-lg" />
        </CardBody>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardBody className="space-y-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-3.5 w-40" />
                <Skeleton className="h-2 w-full rounded-full" />
                <Skeleton className="h-3 w-52" />
              </div>
            ))}
          </CardBody>
        </Card>
        <Card>
          <CardBody className="space-y-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </CardBody>
        </Card>
      </div>
    </>
  );
}
