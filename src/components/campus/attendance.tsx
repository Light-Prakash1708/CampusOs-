import * as React from 'react';
import Link from 'next/link';
import { AlertOctagon, AlertTriangle, ArrowRight, CheckCircle2, CircleDashed, Eye, Info, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatPct, RISK_LABEL, type Advice, type RiskState, type TrendPoint } from '@/lib/attendance/planner';

/* ==========================================================================
   Attendance UI parts — server-compatible.
   Risk is never colour alone: every state has an icon and a text label.
   ========================================================================== */

const RISK_STYLE: Record<RiskState, { icon: LucideIcon; cls: string }> = {
  NO_DATA: { icon: CircleDashed, cls: 'border-[hsl(var(--border-strong))] bg-surface text-subtle' },
  SAFE: { icon: CheckCircle2, cls: 'border-mint-ink/40 bg-mint text-mint-ink' },
  WATCH: { icon: Eye, cls: 'border-sun-ink/40 bg-sun text-sun-ink' },
  AT_RISK: { icon: AlertTriangle, cls: 'border-peach-ink/40 bg-peach text-peach-ink' },
  BELOW: { icon: AlertTriangle, cls: 'border-coral-ink/40 bg-coral text-coral-ink' },
  CRITICAL: { icon: AlertOctagon, cls: 'border-coral-ink bg-coral text-coral-ink' },
};

export function RiskBadge({ state, className }: { state: RiskState; className?: string }) {
  const { icon: Icon, cls } = RISK_STYLE[state];
  return (
    <span className={cn('inline-flex items-center gap-1 whitespace-nowrap rounded-md border px-1.5 py-0.5 text-[11.5px] font-bold', cls, className)}>
      <Icon size={12} aria-hidden />
      {RISK_LABEL[state]}
    </span>
  );
}

/** Ring tone for a risk state. */
export function riskTone(state: RiskState): 'mint' | 'sun' | 'peach' | 'coral' | 'lavender' {
  switch (state) {
    case 'SAFE':
      return 'mint';
    case 'WATCH':
      return 'sun';
    case 'AT_RISK':
      return 'peach';
    case 'BELOW':
    case 'CRITICAL':
      return 'coral';
    default:
      return 'lavender';
  }
}

/** Bar fill: one hue for the series (weekly attendance). */
const BAR = 'bg-brand';

function weekLabel(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(d);
}

/**
 * Weekly attendance bars with the minimum as a dashed reference line.
 * Hover or focus a bar for its exact figures; a screen-reader table carries
 * the same data. Weeks without classes are gaps, never zero-height bars.
 */
export function AttendanceTrend({
  points,
  minimumPct,
  minimumLabel,
  title = 'Weekly attendance',
  className,
}: {
  points: TrendPoint[];
  minimumPct: number | null;
  minimumLabel?: string;
  title?: string;
  className?: string;
}) {
  const any = points.some((p) => p.weekBp !== null);
  const id = React.useId();
  return (
    <figure className={cn('w-full', className)} aria-labelledby={`${id}-cap`}>
      <figcaption id={`${id}-cap`} className="sr-only">
        {title}, last {points.length} weeks{minimumPct !== null ? `; minimum ${minimumPct}%` : ''}.
      </figcaption>
      {!any ? (
        <p className="flex h-[150px] items-center justify-center rounded-xl border-[1.5px] border-dashed border-[hsl(var(--border-strong))] text-[12.5px] text-subtle">
          No classes marked in these weeks.
        </p>
      ) : (
        <div aria-hidden className="relative">
          {/* y guides */}
          <div className="pointer-events-none absolute inset-x-0 top-0 h-[150px]">
            {[100, 50].map((g) => (
              <span key={g} className="absolute inset-x-0 border-t border-[hsl(var(--border))]" style={{ bottom: `${g}%` }}>
                <span className="absolute -top-2 right-0 bg-surface-raised pl-1 text-[9.5px] font-semibold text-subtle">{g}%</span>
              </span>
            ))}
            {minimumPct !== null ? (
              <span className="absolute inset-x-0 border-t-2 border-dashed border-ink/70" style={{ bottom: `${minimumPct}%` }}>
                <span className="absolute -top-[18px] left-0 rounded bg-ink px-1 text-[9.5px] font-bold text-white">
                  {minimumLabel ?? `${minimumPct}% min`}
                </span>
              </span>
            ) : null}
          </div>
          <ol className="relative flex h-[150px] items-end gap-1.5 pr-7 sm:gap-2.5">
            {points.map((p) => (
              <li key={p.weekStart} className="group relative flex h-full flex-1 flex-col justify-end">
                {p.weekBp === null ? (
                  <span className="mx-auto mb-0 h-1 w-3 rounded-full bg-[hsl(var(--border-strong))]" />
                ) : (
                  <span
                    tabIndex={0}
                    className={cn('relative block w-full rounded-t-[4px] outline-none focus-visible:ring-2 focus-visible:ring-brand/50', BAR)}
                    style={{ height: `${Math.max(2, p.weekBp / 100)}%` }}
                  >
                    <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1.5 hidden w-max -translate-x-1/2 rounded-lg border-[1.5px] border-ink bg-surface px-2 py-1 text-[11px] font-semibold text-default shadow-pop group-hover:block group-focus-within:block">
                      Week of {weekLabel(p.weekStart)}: {formatPct(p.weekBp)}
                      <span className="block font-normal text-subtle">
                        {p.attended}/{p.held} classes · running {formatPct(p.cumulativeBp)}
                      </span>
                    </span>
                  </span>
                )}
              </li>
            ))}
          </ol>
          <ol className="mt-1.5 flex gap-1.5 pr-7 sm:gap-2.5">
            {points.map((p) => (
              <li key={p.weekStart} className="flex-1 text-center text-[9.5px] font-semibold text-subtle sm:text-[10.5px]">
                {weekLabel(p.weekStart)}
              </li>
            ))}
          </ol>
        </div>
      )}
      <table className="sr-only">
        <caption>{title}</caption>
        <thead>
          <tr>
            <th scope="col">Week of</th>
            <th scope="col">Classes attended</th>
            <th scope="col">Week %</th>
            <th scope="col">Running %</th>
          </tr>
        </thead>
        <tbody>
          {points.map((p) => (
            <tr key={p.weekStart}>
              <td>{weekLabel(p.weekStart)}</td>
              <td>{p.held ? `${p.attended} of ${p.held}` : 'No classes'}</td>
              <td>{formatPct(p.weekBp)}</td>
              <td>{formatPct(p.cumulativeBp)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

const ADVICE_STYLE: Record<Advice['severity'], { icon: LucideIcon; cls: string; ink: string }> = {
  critical: { icon: AlertOctagon, cls: 'bg-coral', ink: 'text-coral-ink' },
  warning: { icon: AlertTriangle, cls: 'bg-sun', ink: 'text-sun-ink' },
  info: { icon: Info, cls: 'bg-sky', ink: 'text-sky-ink' },
  good: { icon: CheckCircle2, cls: 'bg-mint', ink: 'text-mint-ink' },
};

/** The advisor's ranked list ("What should I do?"). */
export function AdvisorList({
  advice,
  subjectHref,
  disputeHref,
}: {
  advice: Advice[];
  /** Link for a subject-specific item; omit to render without links. */
  subjectHref?: (offeringId: string) => string;
  /** Shown on CRITICAL items so the student can raise it with the college. */
  disputeHref?: string | null;
}) {
  return (
    <ul className="space-y-2.5">
      {advice.map((a, i) => {
        const { icon: Icon, cls, ink } = ADVICE_STYLE[a.severity];
        return (
          <li key={`${a.offeringId ?? 'all'}-${i}`} className={cn('rounded-xl border-[1.5px] border-ink p-3', cls)}>
            <div className="flex gap-2.5">
              <Icon size={18} className={cn('mt-0.5 shrink-0', ink)} aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="text-[13.5px] font-extrabold leading-snug text-default">{a.title}</p>
                <p className="mt-0.5 text-[12.5px] leading-snug text-muted">{a.body}</p>
                <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
                  {a.offeringId && subjectHref ? (
                    <Link href={subjectHref(a.offeringId)} className={cn('inline-flex items-center gap-1 text-[12px] font-bold hover:underline', ink)}>
                      See the subject <ArrowRight size={12} aria-hidden />
                    </Link>
                  ) : null}
                  {a.state === 'CRITICAL' && disputeHref ? (
                    <Link href={disputeHref} className={cn('inline-flex items-center gap-1 text-[12px] font-bold hover:underline', ink)}>
                      Raise it with your college <ArrowRight size={12} aria-hidden />
                    </Link>
                  ) : null}
                </div>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** Thin bar for a subject percentage with the minimum tick. */
export function AttendanceBar({ bp, minimumPct, state }: { bp: number | null; minimumPct: number; state: RiskState }) {
  const fill = { SAFE: 'bg-mint-ink', WATCH: 'bg-sun-ink', AT_RISK: 'bg-peach-ink', BELOW: 'bg-coral-ink', CRITICAL: 'bg-coral-ink', NO_DATA: 'bg-transparent' }[state];
  return (
    <span className="relative block h-2 w-full overflow-hidden rounded-full bg-surface-sunken" aria-hidden>
      {bp !== null ? <span className={cn('block h-full rounded-full', fill)} style={{ width: `${bp / 100}%` }} /> : null}
      <span className="absolute inset-y-0 w-0.5 bg-ink" style={{ left: `${minimumPct}%` }} />
    </span>
  );
}
