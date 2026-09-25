'use client';

import * as React from 'react';
import Link from 'next/link';
import { AlertTriangle, ArrowRight, Info, Minus, Plus } from 'lucide-react';
import { CampusRing } from '@/components/campus';
import { CampusSlider } from '@/components/campus/overlays';
import {
  bestCase,
  classesToReach,
  formatPct,
  meetsTarget,
  percentBp,
  project,
  reachableThisTerm,
  safeAbsences,
  simulate,
  type Tally,
} from '@/lib/attendance/planner';
import { cn } from '@/lib/utils';

export interface PlannerSubject {
  offeringId: string;
  name: string;
  code: string;
  held: number;
  attended: number;
  minimumPct: number;
  remaining: number | null;
}

export interface PlannerProps {
  subjects: PlannerSubject[];
  overall: Tally;
  /** College's overall minimum if it has one, else its default minimum. */
  overallMinimumPct: number;
  overallIsRule: boolean;
  initialScope: string;
}

const COUNTS = [1, 2, 3, 4, 5];
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function Stepper({ label, value, onChange, max = 60 }: { label: string; value: number; onChange: (n: number) => void; max?: number }) {
  const id = React.useId();
  return (
    <div>
      <label htmlFor={id} className="text-[12.5px] font-bold text-default">
        {label}
      </label>
      <div className="mt-1 flex items-center gap-1.5">
        <button type="button" onClick={() => onChange(Math.max(0, value - 1))} className="flex h-11 w-11 items-center justify-center rounded-xl border-[1.5px] border-ink bg-surface shadow-pop campus-press" aria-label={`${label}: one fewer`}>
          <Minus size={16} aria-hidden />
        </button>
        <input
          id={id}
          type="number"
          inputMode="numeric"
          min={0}
          max={max}
          value={value}
          onChange={(e) => onChange(Math.max(0, Math.min(max, Math.floor(Number(e.target.value) || 0))))}
          className="tabular h-11 w-16 rounded-xl border-[1.5px] border-[hsl(var(--border-strong))] bg-surface text-center text-[15px] font-extrabold text-default focus:border-ink focus:outline-none"
        />
        <button type="button" onClick={() => onChange(Math.min(max, value + 1))} className="flex h-11 w-11 items-center justify-center rounded-xl border-[1.5px] border-ink bg-surface shadow-pop campus-press" aria-label={`${label}: one more`}>
          <Plus size={16} aria-hidden />
        </button>
      </div>
    </div>
  );
}

/**
 * The interactive Attendance Planner. Every figure is recomputed in the
 * browser with the same pure functions the server and the tests use
 * (src/lib/attendance/planner.ts). Nothing is saved; nothing touches records.
 */
export function Planner({ subjects, overall, overallMinimumPct, overallIsRule, initialScope }: PlannerProps) {
  const [scope, setScope] = React.useState(initialScope);
  const subject = subjects.find((s) => s.offeringId === scope) ?? null;
  const minimum = subject ? subject.minimumPct : overallMinimumPct;
  const [target, setTarget] = React.useState(minimum);
  const [miss, setMiss] = React.useState(0);
  const [attend, setAttend] = React.useState(0);

  // New scope → start from that scope's minimum.
  React.useEffect(() => {
    setTarget(subject ? subject.minimumPct : overallMinimumPct);
    setMiss(0);
    setAttend(0);
  }, [scope, subject, overallMinimumPct]);

  const tally: Tally = subject ? { held: subject.held, attended: subject.attended } : overall;
  const remaining = subject ? subject.remaining : null;
  const current = percentBp(tally);
  const safe = safeAbsences(tally, target);
  const need = classesToReach(tally, target);
  const reachable = reachableThisTerm(tally, target, remaining);
  const best = remaining !== null ? bestCase(tally, remaining) : null;
  const scenario = project(tally, { miss, attend });
  const scenarioBp = percentBp(scenario);
  const scenarioOk = meetsTarget(scenario, target);
  const ifMiss = simulate(tally, 'miss', COUNTS, target);
  const ifAttend = simulate(tally, 'attend', COUNTS, target);
  const atTarget = need === 0 && safe === 0 && tally.held > 0;
  const belowMinimum = target < minimum;

  let headline: React.ReactNode;
  if (tally.held === 0) {
    headline = <p className="text-[13px] text-muted">No classes have been marked yet, so there is nothing to plan against.</p>;
  } else if (need === null) {
    headline = (
      <>
        <p className="font-display text-[20px] font-extrabold text-default">{target}% isn’t possible any more</p>
        <p className="mt-1 text-[12.5px] text-muted">You’ve missed {plural(tally.held - tally.attended, 'class', 'classes')}, so 100% can’t be reached. Try a lower target.</p>
      </>
    );
  } else if (need > 0) {
    headline = (
      <>
        <p className="text-[12.5px] font-bold uppercase tracking-wide text-subtle">To reach {target}%</p>
        <p className="font-display text-[22px] font-extrabold leading-tight text-default">
          Attend the next <span className="tabular text-coral-ink">{need}</span> {need === 1 ? 'class' : 'classes'}
        </p>
        <p className="mt-1 text-[12.5px] text-muted">
          {reachable === false
            ? `Only ${plural(remaining ?? 0, 'class is', 'classes are')} left this term — the best you can reach is ${formatPct(best)}.`
            : 'in a row, without a further absence.'}
        </p>
      </>
    );
  } else {
    headline = (
      <>
        <p className="text-[12.5px] font-bold uppercase tracking-wide text-subtle">You can safely miss</p>
        <p className="flex items-baseline gap-2">
          <span className="tabular font-display text-[44px] font-extrabold leading-none text-default">{safe}</span>
          <span className="text-[14px] font-bold text-default">{safe === 1 ? 'class' : 'classes'}</span>
        </p>
        <p className="mt-1 text-[12.5px] text-muted">
          {atTarget ? `You’re exactly at ${target}% — the next absence takes you below it.` : `and stay at or above ${target}%. Keep this buffer for illness and emergencies.`}
        </p>
      </>
    );
  }

  return (
    <div className="space-y-5">
      {/* scope picker: horizontal on phones */}
      <nav aria-label="What to plan" className="-mx-1 overflow-x-auto px-1 scrollbar-none">
        <ul className="flex w-max gap-2 py-1">
          {[{ offeringId: 'overall', name: 'Overall' }, ...subjects].map((s) => (
            <li key={s.offeringId}>
              <button
                type="button"
                onClick={() => setScope(s.offeringId)}
                aria-pressed={scope === s.offeringId}
                className={cn(
                  'min-h-[40px] rounded-full border-[1.5px] px-3.5 text-[12.5px] font-bold',
                  scope === s.offeringId ? 'border-ink bg-brand text-white shadow-pop' : 'border-[hsl(var(--border-strong))] bg-surface text-muted hover:border-ink',
                )}
              >
                {s.name}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* current */}
        <section aria-labelledby="cur-h" className="rounded-2xl border-[1.5px] border-ink bg-surface-raised p-4 shadow-pop">
          <h2 id="cur-h" className="font-display text-[15px] font-extrabold text-default">
            Current overview{subject ? ` · ${subject.code}` : ''}
          </h2>
          <div className="mt-3 flex items-center gap-4">
            <CampusRing value={current === null ? null : current / 100} label="Current attendance" sublabel="current" tone={current !== null && meetsTarget(tally, minimum) ? 'mint' : 'coral'} marker={minimum} size={112} thickness={13} emptyLabel="No classes yet" />
            <dl className="space-y-1.5 text-[13px]">
              {[
                ['Total classes', tally.held, 'bg-lavender'],
                ['Attended', tally.attended, 'bg-mint'],
                ['Missed', tally.held - tally.attended, 'bg-coral'],
              ].map(([l, v, c]) => (
                <div key={l as string} className="flex items-center gap-2">
                  <span className={cn('h-2.5 w-2.5 rounded-full border border-ink', c as string)} aria-hidden />
                  <dt className="text-muted">{l}</dt>
                  <dd className="tabular ml-auto pl-3 font-extrabold text-default">{v}</dd>
                </div>
              ))}
            </dl>
          </div>
          <p className="mt-3 text-[11.5px] text-subtle">
            {subject ? `Minimum for this subject: ${minimum}%.` : overallIsRule ? `Your college requires ${minimum}% overall, as well as each subject’s own minimum.` : `Your college applies minimums per subject; overall is a guide (college default ${minimum}%).`}
          </p>
        </section>

        {/* target */}
        <section aria-labelledby="tgt-h" className="rounded-2xl border-[1.5px] border-ink bg-surface-raised p-4 shadow-pop">
          <h2 id="tgt-h" className="font-display text-[15px] font-extrabold text-default">
            Your target
          </h2>
          <p className="text-[12px] text-subtle">Set the attendance % you want to stay at.</p>
          <div className="mt-3">
            <CampusSlider label="Target attendance" value={target} onChange={setTarget} min={50} max={100} step={1} ticks={[50, 60, 70, 80, 90, 100]} format={(v) => `${v}%`} valueText={`${target} percent target`} />
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <button type="button" onClick={() => setTarget(minimum)} className="min-h-[36px] rounded-lg border-[1.5px] border-[hsl(var(--border-strong))] px-2.5 text-[12px] font-bold text-muted hover:border-ink">
              Use minimum ({minimum}%)
            </button>
          </div>
          {belowMinimum ? (
            <p className="mt-2 flex gap-1.5 rounded-lg bg-sun p-2 text-[12px] text-sun-ink" role="note">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden />
              {target}% is below your college’s minimum of {minimum}%. The minimum still decides exam eligibility.
            </p>
          ) : null}
        </section>

        {/* answer */}
        <section aria-labelledby="ans-h" aria-live="polite" className={cn('rounded-2xl border-[1.5px] border-ink p-4 shadow-pop', need && need > 0 ? 'bg-coral' : need === null ? 'bg-peach' : 'bg-mint')}>
          <h2 id="ans-h" className="sr-only">
            Result
          </h2>
          {headline}
          <p className="mt-3 flex gap-1.5 text-[11.5px] text-muted">
            <Info size={13} className="mt-0.5 shrink-0" aria-hidden />
            Estimates from recorded classes and your selected target. Institutional attendance policies may differ.
          </p>
        </section>
      </div>

      {/* what-if tables */}
      <section aria-labelledby="sim-h" id="simulate" className="scroll-mt-20 rounded-2xl border-[1.5px] border-ink bg-surface-raised p-4 shadow-pop sm:p-5">
        <h2 id="sim-h" className="font-display text-[17px] font-extrabold text-default">
          What if…
        </h2>
        <p className="text-[12.5px] text-muted">Each row is counted from where you are now, against your {target}% target.</p>
        <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2">
          {[
            { title: 'I miss the next…', rows: ifMiss },
            { title: 'I attend the next…', rows: ifAttend },
          ].map((tbl) => (
            <table key={tbl.title} className="w-full text-[13px]">
              <caption className="mb-1.5 text-left text-[12.5px] font-extrabold text-default">{tbl.title}</caption>
              <thead className="sr-only">
                <tr>
                  <th scope="col">Classes</th>
                  <th scope="col">Attendance after</th>
                  <th scope="col">Meets target</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[hsl(var(--border))] rounded-xl border-[1.5px] border-ink">
                {tbl.rows.map((r) => (
                  <tr key={r.n}>
                    <td className="px-3 py-2 font-semibold text-muted">{plural(r.n, 'class', 'classes')}</td>
                    <td className="tabular px-3 py-2 text-right font-extrabold text-default">{formatPct(r.percentBp)}</td>
                    <td className={cn('px-3 py-2 text-right text-[12px] font-bold', r.meetsTarget ? 'text-mint-ink' : 'text-coral-ink')}>
                      {r.meetsTarget ? '✓ above target' : '✕ below target'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ))}
        </div>

        <div className="mt-5 rounded-xl border-[1.5px] border-dashed border-[hsl(var(--border-strong))] p-3.5">
          <p className="text-[12.5px] font-extrabold text-default">Try your own plan</p>
          <div className="mt-2 flex flex-wrap items-end gap-4">
            <Stepper label="Classes I’ll attend" value={attend} onChange={setAttend} />
            <Stepper label="Classes I’ll miss" value={miss} onChange={setMiss} />
            <div className="min-w-[180px] flex-1 rounded-xl border-[1.5px] border-ink bg-surface p-3" aria-live="polite">
              <p className="text-[11.5px] font-bold uppercase tracking-wide text-subtle">You’d end up at</p>
              <p className="tabular font-display text-[26px] font-extrabold leading-tight text-default">{formatPct(scenarioBp)}</p>
              <p className={cn('text-[12px] font-bold', scenarioOk ? 'text-mint-ink' : 'text-coral-ink')}>
                {scenario.held === 0 ? 'No classes in this plan yet' : scenarioOk ? `At or above ${target}%` : `Below ${target}%`} · {scenario.attended}/{scenario.held} classes
              </p>
            </div>
          </div>
          {remaining !== null && attend + miss > remaining ? (
            <p className="mt-2 text-[12px] text-sun-ink">That’s more than the {plural(remaining, 'class', 'classes')} still scheduled this term.</p>
          ) : null}
        </div>
      </section>

      {/* subject breakdown at their own minimums */}
      <section aria-labelledby="brk-h" className="rounded-2xl border-[1.5px] border-ink bg-surface-raised shadow-pop">
        <h2 id="brk-h" className="p-4 pb-2 font-display text-[17px] font-extrabold text-default sm:px-5">
          Subject-wise buffer
        </h2>
        <ul className="divide-y divide-[hsl(var(--border))]">
          {subjects.map((s) => {
            const t = { held: s.held, attended: s.attended };
            const bp = percentBp(t);
            const sNeed = classesToReach(t, s.minimumPct);
            const sSafe = safeAbsences(t, s.minimumPct);
            return (
              <li key={s.offeringId} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 sm:px-5">
                <button type="button" onClick={() => setScope(s.offeringId)} className="min-w-0 basis-full text-left sm:flex-1 sm:basis-auto">
                  <span className="block truncate text-[13.5px] font-bold text-default hover:underline">{s.name}</span>
                  <span className="text-[11.5px] text-subtle">
                    {s.attended}/{s.held} · min {s.minimumPct}%
                  </span>
                </button>
                <span className="tabular font-extrabold text-default sm:w-14 sm:text-right">{formatPct(bp, 0)}</span>
                <span className={cn('flex-1 text-[12.5px] font-bold sm:w-40 sm:flex-none sm:text-right', sNeed ? 'text-coral-ink' : 'text-default')}>
                  {s.held === 0 ? 'No classes yet' : sNeed === null ? 'Can’t reach' : sNeed > 0 ? `Attend next ${sNeed}` : `Can miss ${sSafe}`}
                </span>
                <Link href={`/student/attendance/${s.offeringId}`} className="inline-flex items-center gap-0.5 text-[12.5px] font-bold text-brand hover:underline">
                  View <ArrowRight size={12} aria-hidden />
                </Link>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
