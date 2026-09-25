import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Flame } from 'lucide-react';
import { isEnabled } from '@/lib/features';
import { CATEGORY_LABEL } from '@/lib/tracker';
import { CampusCard, CampusPill, CampusSectionHeader, CampusStat } from '@/components/campus';
import { ActivityHeatmap } from '@/components/campus/tracker';
import { getTrackerOverview } from '@/services/tracker';
import { requireStudentContext } from '../../_lib/auth';
import { CheckInButton, GoalActions, StepsEditor } from '../TrackerClient';

export const metadata = { title: 'Goal' };
export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function GoalPage({ params }: { params: Promise<{ goalId: string }> }) {
  const user = await requireStudentContext();
  if (!isEnabled(user.featureFlags, 'personal_tracker_enabled')) notFound();
  const { goalId } = await params;
  if (!UUID_RE.test(goalId)) notFound();
  // Only the caller's own goals are ever loaded.
  const o = await getTrackerOverview(user);
  const g = o.goals.find((x) => x.id === goalId);
  if (!g) notFound();

  const unitWord = g.cadence === 'WEEKLY' ? 'week' : 'day';
  const stepsDone = g.steps.filter((s) => s.done).length;
  const canComplete = g.cadence === 'ONCE' ? g.steps.length === 0 || stepsDone === g.steps.length : true;

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <Link href="/student/tracker" className="inline-flex min-h-[44px] items-center gap-1.5 text-[13px] font-bold text-muted hover:text-default">
        <ArrowLeft size={15} aria-hidden /> Tracker
      </Link>
      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <CampusPill tone="lavender">{CATEGORY_LABEL[g.category]}</CampusPill>
          <CampusPill tone="sky">{g.cadence === 'DAILY' ? 'Daily habit' : g.cadence === 'WEEKLY' ? `${g.targetPerPeriod} days a week` : 'Goal with steps'}</CampusPill>
          {g.status !== 'ACTIVE' ? <CampusPill tone="sun">{g.status === 'COMPLETED' ? 'Completed' : 'Paused'}</CampusPill> : null}
        </div>
        <h1 className="font-display text-[26px] font-extrabold text-default sm:text-[30px]">{g.title}</h1>
        {g.description ? <p className="max-w-2xl text-[14px] text-muted">{g.description}</p> : null}
        <p className="text-[12.5px] text-subtle">
          Started {g.startDate}
          {g.targetDate ? ` · target ${g.targetDate}` : ''}
        </p>
      </header>

      {g.cadence !== 'ONCE' ? (
        <>
          <section aria-label="Streaks" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <CampusStat label="Current streak" value={`${g.state.current} ${unitWord}${g.state.current === 1 ? '' : 's'}`} tone="peach" />
            <CampusStat label="Best streak" value={`${g.state.best} ${unitWord}${g.state.best === 1 ? '' : 's'}`} tone="sun" />
            <CampusStat label={g.cadence === 'WEEKLY' ? 'Weeks met, last 30 days' : 'Days met, last 30 days'} value={g.rate30 === null ? null : `${g.rate30}%`} hint={g.rate30 === null ? 'Not enough history yet' : undefined} tone="mint" />
            <CampusStat label={g.unit ? `Total ${g.unit}` : g.cadence === 'WEEKLY' ? 'This week' : 'Today'} value={g.unit ? g.totalAmount : `${g.state.period.done}/${g.state.period.target}`} tone="lavender" />
          </section>
          {g.status === 'ACTIVE' ? (
            <CampusCard className="flex flex-wrap items-center justify-between gap-3 p-4">
              <p className="flex items-center gap-2 text-[14px] font-bold text-default">
                <Flame size={18} className="text-peach-ink" aria-hidden />
                {g.state.period.met
                  ? g.cadence === 'WEEKLY'
                    ? 'This week’s target is met.'
                    : 'Done for today.'
                  : g.state.current > 0
                    ? `Check in to keep your ${g.state.current}-${unitWord} streak.`
                    : 'Check in to start a streak.'}
              </p>
              <CheckInButton goalId={g.id} title={g.title} done={g.cadence === 'DAILY' ? g.state.period.met : g.state.checkedToday} unit={g.unit} compact />
            </CampusCard>
          ) : null}
          <CampusCard as="section" className="p-4 sm:p-5" aria-labelledby="hm-h">
            <CampusSectionHeader id="hm-h" title="Last 5 weeks" />
            <ActivityHeatmap days={g.heatmap} label={`Check-ins for ${g.title}`} className="mt-3 max-w-[320px]" />
          </CampusCard>
        </>
      ) : (
        <CampusCard as="section" className="p-4 sm:p-5" aria-labelledby="steps-h">
          <CampusSectionHeader id="steps-h" title={g.steps.length ? `Steps · ${stepsDone} of ${g.steps.length}` : 'Steps'} />
          <div className="mt-2">
            <StepsEditor goalId={g.id} steps={g.steps} locked={g.status === 'COMPLETED'} />
          </div>
        </CampusCard>
      )}

      <CampusCard as="section" className="p-4 sm:p-5" aria-labelledby="manage-h">
        <CampusSectionHeader id="manage-h" title="Manage" />
        <div className="mt-3">
          <GoalActions goalId={g.id} status={g.status} canComplete={canComplete} />
        </div>
      </CampusCard>
    </div>
  );
}
