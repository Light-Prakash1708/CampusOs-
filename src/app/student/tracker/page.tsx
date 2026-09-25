import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronRight, Flame, Lock, Plus } from 'lucide-react';
import { isEnabled } from '@/lib/features';
import { CATEGORY_LABEL } from '@/lib/tracker';
import { CampusCard, CampusEmptyState, CampusPill, CampusSectionHeader, CampusStat } from '@/components/campus';
import { ActivityHeatmap } from '@/components/campus/tracker';
import { getTrackerOverview } from '@/services/tracker';
import { requireStudentContext } from '../_lib/auth';
import { CheckInButton, TaskPanel } from './TrackerClient';

export const metadata = { title: 'Tracker' };
export const dynamic = 'force-dynamic';

const CADENCE_LABEL = { DAILY: 'Daily', WEEKLY: 'Weekly', ONCE: 'Milestone' } as const;

export default async function TrackerPage({ searchParams }: { searchParams: Promise<{ add?: string }> }) {
  const user = await requireStudentContext();
  if (!isEnabled(user.featureFlags, 'personal_tracker_enabled')) notFound();
  const { add } = await searchParams;
  const o = await getTrackerOverview(user);
  const habits = o.goals.filter((g) => g.status === 'ACTIVE' && g.cadence !== 'ONCE');
  const dailyHabits = habits.filter((g) => g.cadence === 'DAILY');
  const milestones = o.goals.filter((g) => g.status === 'ACTIVE' && g.cadence === 'ONCE');
  const other = o.goals.filter((g) => g.status !== 'ACTIVE');

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-[26px] font-extrabold text-default sm:text-[30px]">Tracker</h1>
          <p className="mt-1 flex items-center gap-1.5 text-[13.5px] text-muted">
            <Lock size={13} aria-hidden /> Your goals, habits and to-dos. Only you can see them.
          </p>
        </div>
        <Link
          href="/student/tracker/goals/new"
          className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border-[1.5px] border-ink bg-brand px-4 text-[13.5px] font-extrabold text-white shadow-pop campus-press"
        >
          <Plus size={16} aria-hidden /> New goal
        </Link>
      </header>

      <section aria-label="Summary" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <CampusStat label="Active goals" value={o.summary.activeGoals} tone="lavender" />
        <CampusStat label="Still to do today" value={dailyHabits.length ? o.summary.dueToday : null} hint={dailyHabits.length ? undefined : 'No daily habits'} tone="sun" />
        <CampusStat label="Check-ins, last 7 days" value={o.summary.checkinsThisWeek} tone="mint" />
        <CampusStat label="Best current streak" value={habits.length ? o.summary.bestCurrentStreak : null} hint={habits.length ? undefined : 'Start a habit'} tone="peach" />
      </section>

      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="space-y-5">
          <CampusCard as="section" className="p-4 sm:p-5" aria-labelledby="habits-h">
            <CampusSectionHeader id="habits-h" title="Habits" />
            {habits.length === 0 ? (
              <CampusEmptyState
                sprite="student"
                title="No habits yet"
                description="Pick one small thing — 20 minutes of reading, a few practice problems — and check in each day."
                action={
                  <Link href="/student/tracker/goals/new" className="inline-flex min-h-[44px] items-center rounded-xl border-[1.5px] border-ink bg-brand px-4 text-[13px] font-extrabold text-white shadow-pop">
                    Start a habit
                  </Link>
                }
              />
            ) : (
              <ul className="mt-3 divide-y divide-[hsl(var(--border))]">
                {habits.map((g) => (
                  <li key={g.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <Link href={`/student/tracker/${g.id}`} className="group min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate text-[14.5px] font-extrabold text-default group-hover:underline">{g.title}</span>
                        <ChevronRight size={14} className="shrink-0 text-subtle" aria-hidden />
                      </span>
                      <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-muted">
                        <CampusPill tone="lavender">{CATEGORY_LABEL[g.category]}</CampusPill>
                        <span>
                          {g.cadence === 'DAILY'
                            ? g.targetPerPeriod > 1
                              ? `${g.state.period.done}/${g.targetPerPeriod} today`
                              : 'Every day'
                            : `${g.state.period.done}/${g.targetPerPeriod} days this week`}
                        </span>
                        <span className="inline-flex items-center gap-1 font-bold text-peach-ink">
                          <Flame size={13} aria-hidden />
                          {g.state.current > 0 ? `${g.state.current}-${g.cadence === 'WEEKLY' ? 'week' : 'day'} streak` : 'No streak yet'}
                        </span>
                      </span>
                    </Link>
                    <CheckInButton goalId={g.id} title={g.title} done={g.cadence === 'DAILY' ? g.state.period.met : g.state.checkedToday} unit={g.unit} compact />
                  </li>
                ))}
              </ul>
            )}
          </CampusCard>

          {milestones.length ? (
            <CampusCard as="section" className="p-4 sm:p-5" aria-labelledby="ms-h">
              <CampusSectionHeader id="ms-h" title="Goals with steps" />
              <ul className="mt-3 grid gap-3 sm:grid-cols-2">
                {milestones.map((g) => {
                  const done = g.steps.filter((s) => s.done).length;
                  const pct = g.steps.length ? Math.round((done / g.steps.length) * 100) : 0;
                  return (
                    <li key={g.id}>
                      <Link href={`/student/tracker/${g.id}`} className="block rounded-xl border-[1.5px] border-ink bg-surface p-3 shadow-pop campus-press">
                        <span className="block truncate text-[14px] font-extrabold text-default">{g.title}</span>
                        <span className="mt-1 block text-[12px] text-muted">
                          {g.steps.length ? `${done} of ${g.steps.length} steps` : 'No steps yet'}
                          {g.targetDate ? ` · by ${g.targetDate}` : ''}
                        </span>
                        <span className="mt-2 block h-2 overflow-hidden rounded-full bg-[hsl(var(--surface-sunken))]" aria-hidden>
                          <span className="block h-full rounded-full bg-brand" style={{ width: `${pct}%` }} />
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </CampusCard>
          ) : null}

          {o.goals.length ? (
            <CampusCard as="section" className="p-4 sm:p-5" aria-labelledby="act-h">
              <CampusSectionHeader id="act-h" title="Last 5 weeks" />
              <ActivityHeatmap days={o.heatmap} label="Your check-ins" className="mt-3 max-w-[320px]" />
            </CampusCard>
          ) : null}

          {other.length ? (
            <CampusCard as="section" className="p-4 sm:p-5" aria-labelledby="other-h">
              <CampusSectionHeader id="other-h" title="Paused and completed" />
              <ul className="mt-2 divide-y divide-[hsl(var(--border))]">
                {other.map((g) => (
                  <li key={g.id}>
                    <Link href={`/student/tracker/${g.id}`} className="flex min-h-[44px] items-center justify-between gap-3 py-2 hover:underline">
                      <span className="truncate text-[13.5px] font-semibold text-default">{g.title}</span>
                      <span className="shrink-0 text-[12px] font-bold text-subtle">{g.status === 'COMPLETED' ? 'Completed' : 'Paused'} · {CADENCE_LABEL[g.cadence]}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </CampusCard>
          ) : null}
        </div>

        <CampusCard as="section" className="p-4 sm:p-5" aria-labelledby="tasks-h" id="tasks">
          <CampusSectionHeader id="tasks-h" title={`To-do${o.summary.openTasks ? ` · ${o.summary.openTasks}` : ''}`} />
          <div className="mt-3">
            <TaskPanel tasks={o.tasks} today={o.today} autoFocus={add === 'task'} />
          </div>
        </CampusCard>
      </div>

      <p className="text-[12.5px] text-subtle">
        Want it gone? <Link href="/account/privacy" className="font-bold underline">Delete all tracker data</Link> from Privacy & your data — it’s erased immediately.
      </p>
    </div>
  );
}
