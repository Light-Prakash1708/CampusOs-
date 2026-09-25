import { Card, CardBody, Skeleton, SkeletonRows } from '@/components/ui';

/** Mirrors the dashboard layout so the page does not jump when data arrives. */
export default function StudentLoading() {
  return (
    <>
      <div className="mb-5 space-y-2">
        <Skeleton className="h-3.5 w-52" />
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-3.5 w-72" />
      </div>

      <div className="mb-6 space-y-2.5">
        <Skeleton className="h-16 w-full rounded-lg" />
        <Skeleton className="h-16 w-full rounded-lg" />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card>
            <CardBody className="space-y-3">
              <Skeleton className="h-5 w-24 rounded-full" />
              <Skeleton className="h-6 w-56" />
              <Skeleton className="h-3.5 w-72" />
              <Skeleton className="h-3.5 w-64" />
            </CardBody>
          </Card>
          <Card>
            <CardBody>
              <SkeletonRows rows={4} />
            </CardBody>
          </Card>
          <Card>
            <CardBody>
              <SkeletonRows rows={3} />
            </CardBody>
          </Card>
        </div>
        <div className="space-y-5">
          <Card>
            <CardBody>
              <SkeletonRows rows={4} />
            </CardBody>
          </Card>
          <Card>
            <CardBody>
              <SkeletonRows rows={3} />
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}
