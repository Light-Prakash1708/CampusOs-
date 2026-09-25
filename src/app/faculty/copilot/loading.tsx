import { Skeleton } from '@/components/ui';

export default function CopilotLoading() {
  return (
    <div>
      <Skeleton className="h-7 w-52" />
      <Skeleton className="mt-2 h-4 w-[420px]" />
      <div className="mt-5 grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
        <Skeleton className="h-[360px] w-full rounded-xl" />
        <Skeleton className="h-[360px] w-full rounded-xl" />
      </div>
    </div>
  );
}
