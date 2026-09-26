import { Skeleton } from '@/components/ui';

/**
 * Generic page skeleton for module routes: title, a row of stat tiles, and
 * card blocks — so a slow network shows the page's shape, not a blank screen.
 */
export function PageSkeleton({ stats = 4, cards = 4, label = 'Loading' }: { stats?: number; cards?: number; label?: string }) {
  return (
    <div className="space-y-5" role="status" aria-live="polite" aria-label={label}>
      <div className="space-y-2">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-3.5 w-full max-w-md" />
      </div>
      {stats ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: stats }).map((_, i) => (
            <Skeleton key={i} className="h-[76px] w-full rounded-2xl" />
          ))}
        </div>
      ) : null}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {Array.from({ length: cards }).map((_, i) => (
          <Skeleton key={i} className="h-[132px] w-full rounded-2xl" />
        ))}
      </div>
      <span className="sr-only">{label}…</span>
    </div>
  );
}
