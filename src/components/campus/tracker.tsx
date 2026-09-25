import { cn } from '@/lib/utils';

/**
 * Activity heatmap: one square per day, oldest first, in rows of 7 (weeks).
 * Intensity is one hue light→dark (count 0 = empty well). A visually hidden
 * list gives the same numbers to screen readers; each square has a tooltip.
 */
export function ActivityHeatmap({ days, label, className }: { days: { date: string; count: number }[]; label: string; className?: string }) {
  const max = Math.max(1, ...days.map((d) => d.count));
  const level = (n: number) => (n === 0 ? 0 : Math.min(4, Math.ceil((n / max) * 4)));
  const fmt = (iso: string) => new Intl.DateTimeFormat('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`));
  const active = days.filter((d) => d.count > 0).length;
  const fills = ['bg-[hsl(var(--surface-sunken))]', 'bg-[hsl(var(--brand)/0.25)]', 'bg-[hsl(var(--brand)/0.45)]', 'bg-[hsl(var(--brand)/0.7)]', 'bg-[hsl(var(--brand))]'];
  return (
    <figure className={cn('space-y-2', className)}>
      <div role="img" aria-label={`${label}: active on ${active} of the last ${days.length} days`} className="grid grid-cols-7 gap-1.5 sm:gap-2">
        {days.map((d) => (
          <span
            key={d.date}
            title={`${fmt(d.date)} · ${d.count === 0 ? 'no check-ins' : `${d.count} check-in${d.count === 1 ? '' : 's'}`}`}
            className={cn('aspect-square rounded-[5px] border border-ink/15', fills[level(d.count)])}
          />
        ))}
      </div>
      <figcaption className="flex items-center justify-between text-[11.5px] text-subtle">
        <span>
          {fmt(days[0]!.date)} – {fmt(days[days.length - 1]!.date)}
        </span>
        <span className="flex items-center gap-1" aria-hidden>
          Less {fills.map((f) => <span key={f} className={cn('h-2.5 w-2.5 rounded-[3px] border border-ink/15', f)} />)} More
        </span>
      </figcaption>
      <ul className="sr-only">
        {days
          .filter((d) => d.count > 0)
          .map((d) => (
            <li key={d.date}>
              {fmt(d.date)}: {d.count}
            </li>
          ))}
      </ul>
    </figure>
  );
}
