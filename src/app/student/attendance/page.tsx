import Link from 'next/link';
import { ArrowRight, Calculator, Download, Info } from 'lucide-react';
import { CampusCard, CampusComingSoon, CampusEmptyState, CampusRing, CampusSectionHeader, CampusStat, CampusTabs } from '@/components/campus';
import { AdvisorList, AttendanceBar, AttendanceTrend, RiskBadge, riskTone } from '@/components/campus/attendance';
import { formatPct, type RiskState } from '@/lib/attendance/planner';
import { isEnabled } from '@/lib/features';
import { cn, pluralize } from '@/lib/utils';
import { getAttendanceOverview, type SubjectAttendance } from '@/services/attendance';
import { requireStudentContext } from '../_lib/auth';
import { AskAiLink } from '../_components/bits';

export const metadata = { title: 'Attendance Tracker' };
export const dynamic = 'force-dynamic';

/**
 * ATTENDANCE TRACKER — the student's own attendance, from the registers their
 * faculty submitted. Overall ring, weekly trend, advisor, and every subject
 * with its safe absences and recovery. Phones get Overall / Subject-wise tabs;
 * desktop shows both.
 */
export default async function AttendancePage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const user = await requireStudentContext('attendance:view_own');
  const { view } = await searchParams;
  const tab = view === 'subjects' ? 'subjects' : 'overall';
  const data = await getAttendanceOverview(user);
  const { overall, policy, subjects } = data;
  const grievanceOn = isEnabled(user.featureFlags, 'grievance_enabled');
  const recorded = subjects.some((s) => s.held > 0);
  const lineMin = policy.aggregateMinimumPct ?? policy.defaultMinimumPct;
  const overallState: RiskState = overall.held === 0 ? 'NO_DATA' : overall.subjectsBelow > 0 ? 'BELOW' : (overall.aggregateRisk ?? worst(subjects));

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-[26px] font-extrabold leading-tight text-default sm:text-[32px]">Attendance Tracker</h1>
          <p className="mt-1 text-[13.5px] text-muted">
            {data.term ? `${data.term.name} · ` : ''}From the registers your faculty have submitted. Official records can only be changed by your college.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <AskAiLink question="Which subjects am I short of attendance in, and by how much?" />
          {recorded ? (
            <a
              href="/api/attendance/export"
              className="inline-flex h-10 items-center gap-1.5 rounded-xl border-[1.5px] border-ink bg-surface px-3 text-[13px] font-bold text-default shadow-pop campus-press"
            >
              <Download size={15} aria-hidden /> Export CSV
            </a>
          ) : null}
        </div>
      </header>

      {subjects.length === 0 ? (
        <CampusEmptyState sprite="student" title="You aren’t enrolled in any classes yet" description="Once your college enrols you, your subjects and attendance appear here." />
      ) : (
        <>
          <CampusTabs
            className="lg:hidden"
            label="Attendance view"
            active={tab}
            tabs={[
              { key: 'overall', label: 'Overall', href: '/student/attendance' },
              { key: 'subjects', label: 'Subject-wise', href: '/student/attendance?view=subjects', count: subjects.length },
            ]}
          />

          {/* ------------------------------- overall ------------------------------ */}
          <div className={cn('grid grid-cols-1 items-start gap-5 lg:grid lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]', tab !== 'overall' && 'hidden')}>
            <CampusCard className="p-4 sm:p-5" as="section" aria-labelledby="ov-h">
              <CampusSectionHeader id="ov-h" title="Current attendance" />
              <div className="mt-4 flex flex-col items-center gap-4">
                <CampusRing
                  value={overall.percentBp === null ? null : overall.percentBp / 100}
                  label="Overall attendance"
                  sublabel="current attendance"
                  tone={riskTone(overallState)}
                  marker={lineMin}
                  size={148}
                  emptyLabel="No classes marked yet"
                />
                <div className="grid w-full grid-cols-3 gap-2.5">
                  <CampusStat label="Total classes" value={overall.held} tone="lavender" />
                  <CampusStat label="Attended" value={overall.attended} tone="mint" />
                  <CampusStat label="Missed" value={overall.missed} tone="coral" hint={overall.excused ? `+${overall.excused} excused (not counted)` : undefined} />
                </div>
              </div>
              <StatusStrip state={overallState} below={overall.subjectsBelow} lineMin={lineMin} aggregate={policy.aggregateMinimumPct !== null} />
            </CampusCard>

            <CampusCard className="p-4 sm:p-5" as="section" aria-labelledby="trend-h">
              <div className="flex items-baseline justify-between gap-2">
                <CampusSectionHeader id="trend-h" title="Attendance trend" />
                <span className="text-[11.5px] font-semibold text-subtle">Last 8 weeks</span>
              </div>
              <div className="mt-6">
                <AttendanceTrend
                  points={data.trend}
                  minimumPct={lineMin}
                  minimumLabel={policy.aggregateMinimumPct !== null ? `${lineMin}% overall min` : `${lineMin}% min`}
                  title="Your weekly attendance, all subjects"
                />
              </div>
              <p className="mt-3 text-[11.5px] text-subtle">Each bar is that week’s attendance across subjects. Hover or focus a bar for exact numbers.</p>
            </CampusCard>

            <CampusCard className="p-4 sm:p-5" as="section" aria-labelledby="adv-h">
              <CampusSectionHeader id="adv-h" title="What should I do?" />
              <p className="mt-0.5 text-[12px] text-subtle">Worked out from your recorded classes and each subject’s minimum.</p>
              <div className="mt-3">
                <AdvisorList
                  advice={data.advice}
                  subjectHref={(id) => `/student/attendance/${id}`}
                  disputeHref={grievanceOn ? '/student/redressal/new?category=attendance' : null}
                />
              </div>
            </CampusCard>

            <PlannerCard enabled={data.plannerEnabled} recorded={recorded} />
          </div>

          {/* ------------------------------ subjects ------------------------------ */}
          <section id="subjects" aria-labelledby="subj-h" className={cn('scroll-mt-20 lg:block', tab !== 'subjects' && 'hidden')}>
            <CampusSectionHeader id="subj-h" title="Subject-wise breakdown" />
            <SubjectTable subjects={subjects} grievanceOn={grievanceOn} />
          </section>

          <CampusCard className="p-4 sm:p-5" as="section" aria-labelledby="how-h">
            <h2 id="how-h" className="flex items-center gap-2 font-display text-[16px] font-extrabold text-default">
              <Info size={16} aria-hidden /> How this is calculated
            </h2>
            <div className="mt-2 space-y-1.5 text-[12.5px] leading-relaxed text-muted">
              <p>
                <span className="font-semibold text-default">Attendance = attended ÷ held</span>, counting only registers your faculty have submitted. Present and late count as attended;
                absent and medical count as held but not attended; <span className="font-semibold text-default">excused</span> classes are left out entirely. Cancelled classes are never held.
              </p>
              <p>
                <span className="font-semibold text-default">Can miss</span> is the most further absences that keep a subject at its own minimum (set by your college per subject).
                <span className="font-semibold text-default"> Attend next</span> is the fewest classes in a row that bring you back to it. “Close to the line” means within{' '}
                {policy.warningMarginPct} points of the minimum.
              </p>
              <p>Remaining classes come from your published timetable (holidays and cancellations excluded) and are an estimate. Your college’s attendance policy is final.</p>
            </div>
          </CampusCard>
        </>
      )}
    </div>
  );
}

function worst(subjects: SubjectAttendance[]): RiskState {
  const order: RiskState[] = ['CRITICAL', 'BELOW', 'AT_RISK', 'WATCH', 'SAFE', 'NO_DATA'];
  return order.find((s) => subjects.some((x) => x.risk === s)) ?? 'NO_DATA';
}

function StatusStrip({ state, below, lineMin, aggregate }: { state: RiskState; below: number; lineMin: number; aggregate: boolean }) {
  if (state === 'NO_DATA') {
    return <p className="mt-4 rounded-xl border-[1.5px] border-dashed border-[hsl(var(--border-strong))] p-3 text-[12.5px] text-subtle">Your percentage appears as soon as a register is submitted.</p>;
  }
  const text: Record<Exclude<RiskState, 'NO_DATA'>, [string, string]> = {
    SAFE: ['You’re safe!', `Every subject is comfortably above its minimum${aggregate ? ` and you’re above ${lineMin}% overall` : ''}.`],
    WATCH: ['On track — watch closely', 'At least one subject is close to its minimum. See the advice above.'],
    AT_RISK: ['On the edge', 'At least one subject drops below its minimum with the next absence.'],
    BELOW: [`${pluralize(below || 1, 'subject')} below minimum`, 'A shortage can affect exam eligibility. The advice shows exactly how to recover.'],
    CRITICAL: ['Needs your college’s attention', 'A subject can’t reach its minimum this term by attendance alone.'],
  };
  const [title, body] = text[state];
  return (
    <div className={cn('mt-4 flex items-center gap-3 rounded-xl border-[1.5px] border-ink p-3', { SAFE: 'bg-mint', WATCH: 'bg-sun', AT_RISK: 'bg-peach', BELOW: 'bg-coral', CRITICAL: 'bg-coral' }[state])} role="status">
      <RiskBadge state={state} className="shrink-0 bg-surface" />
      <div className="min-w-0 text-[12.5px]">
        <p className="font-extrabold text-default">{title}</p>
        <p className="text-muted">{body}</p>
      </div>
    </div>
  );
}

function PlannerCard({ enabled, recorded }: { enabled: boolean; recorded: boolean }) {
  return (
    <CampusCard tone="sun" className="flex flex-col p-4 sm:p-5" as="section" aria-labelledby="plan-h">
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border-[1.5px] border-ink bg-surface text-sun-ink" aria-hidden>
          <Calculator size={21} />
        </span>
        <div>
          <h2 id="plan-h" className="font-display text-[18px] font-extrabold leading-tight text-default">Attendance Planner</h2>
          <p className="text-[12px] font-semibold text-sun-ink">Bunk Calculator</p>
        </div>
      </div>
      <p className="mt-2 text-[13px] text-muted">
        Set a target and see your buffer, how many classes you need to recover, and what each absence would do — subject by subject.
      </p>
      <div className="mt-auto pt-4">
        {!enabled ? (
          <p className="text-[12.5px] font-semibold text-subtle">Your college has turned the planner off.</p>
        ) : recorded ? (
          <Link href="/tools/attendance-planner" className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border-[1.5px] border-ink bg-ink px-4 text-[13.5px] font-bold text-white shadow-pop campus-press">
            Open the planner <ArrowRight size={15} aria-hidden />
          </Link>
        ) : (
          <CampusComingSoon label="Available once attendance is recorded" />
        )}
      </div>
    </CampusCard>
  );
}

function missText(s: SubjectAttendance): string {
  if (s.held === 0) return 'No classes yet';
  if (s.risk === 'CRITICAL') return 'Can’t reach this term';
  if (s.classesToMinimum === null) return 'Can’t reach';
  if (s.classesToMinimum > 0) return `Attend next ${s.classesToMinimum}`;
  return String(s.safeAbsences);
}

function SubjectTable({ subjects, grievanceOn }: { subjects: SubjectAttendance[]; grievanceOn: boolean }) {
  const dispute = (s: SubjectAttendance) =>
    `/student/redressal/new?${new URLSearchParams({ category: 'attendance', offering: s.offeringId, subject: s.code }).toString()}`;
  return (
    <>
      {/* Desktop table */}
      <CampusCard className="mt-3 hidden overflow-hidden md:block">
        <table className="w-full text-left text-[13px]">
          <thead className="border-b-[1.5px] border-ink bg-surface-sunken/60 text-[11.5px] font-bold uppercase tracking-wide text-subtle">
            <tr>
              <th scope="col" className="px-4 py-2.5">Subject</th>
              <th scope="col" className="px-2 py-2.5 text-right">Total</th>
              <th scope="col" className="px-2 py-2.5 text-right">Attended</th>
              <th scope="col" className="px-2 py-2.5 text-right">Missed</th>
              <th scope="col" className="w-[22%] px-3 py-2.5">Attendance</th>
              <th scope="col" className="px-2 py-2.5 text-right">
                Can miss <span className="sr-only">(safe absences at the subject minimum)</span>
              </th>
              <th scope="col" className="px-4 py-2.5 text-right">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[hsl(var(--border))]">
            {subjects.map((s) => (
              <tr key={s.offeringId} className="hover:bg-surface-sunken/40">
                <td className="px-4 py-3">
                  <Link href={`/student/attendance/${s.offeringId}`} className="font-bold text-default hover:underline">
                    {s.name}
                  </Link>
                  <p className="text-[11.5px] text-subtle">
                    {s.code}
                    {s.facultyName ? ` · ${s.facultyName}` : ''} · min {s.minimumPct}%
                  </p>
                </td>
                <td className="tabular px-2 py-3 text-right text-muted">{s.held}</td>
                <td className="tabular px-2 py-3 text-right text-muted">{s.attended}</td>
                <td className={cn('tabular px-2 py-3 text-right', s.missed ? 'font-bold text-coral-ink' : 'text-muted')}>{s.missed}</td>
                <td className="px-3 py-3">
                  <div className="flex items-center gap-2">
                    <span className="tabular w-12 shrink-0 font-extrabold text-default">{formatPct(s.percentBp, 0)}</span>
                    <AttendanceBar bp={s.percentBp} minimumPct={s.minimumPct} state={s.risk} />
                  </div>
                  <RiskBadge state={s.risk} className="mt-1" />
                </td>
                <td className={cn('tabular px-2 py-3 text-right font-bold', s.classesToMinimum ? 'text-coral-ink' : 'text-default')}>{missText(s)}</td>
                <td className="px-4 py-3 text-right">
                  <Link href={`/student/attendance/${s.offeringId}`} className="inline-flex items-center gap-1 font-bold text-brand hover:underline">
                    View <ArrowRight size={13} aria-hidden />
                  </Link>
                  {grievanceOn ? (
                    <Link href={dispute(s)} className="mt-1 block text-[11.5px] font-semibold text-subtle hover:text-default hover:underline">
                      Dispute a record
                    </Link>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </CampusCard>

      {/* Phone cards */}
      <ul className="mt-3 space-y-3 md:hidden">
        {subjects.map((s) => (
          <li key={s.offeringId}>
            <Link href={`/student/attendance/${s.offeringId}`} className="block rounded-2xl border-[1.5px] border-ink bg-surface-raised p-3.5 shadow-pop campus-press">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-[14px] font-extrabold text-default">{s.name}</p>
                  <p className="text-[11.5px] text-subtle">
                    {s.code} · min {s.minimumPct}%
                  </p>
                </div>
                <span className="tabular shrink-0 font-display text-[20px] font-extrabold text-default">{formatPct(s.percentBp, 0)}</span>
              </div>
              <div className="mt-2">
                <AttendanceBar bp={s.percentBp} minimumPct={s.minimumPct} state={s.risk} />
              </div>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[12px] text-muted">
                <span className="tabular">
                  {s.attended}/{s.held} attended · {s.missed} missed
                </span>
                <RiskBadge state={s.risk} />
              </div>
              <p className={cn('mt-1.5 text-[12px] font-bold', s.classesToMinimum ? 'text-coral-ink' : 'text-default')}>
                {s.held === 0 ? 'No classes yet' : s.classesToMinimum ? `${missText(s)} to reach ${s.minimumPct}%` : `Can miss ${pluralize(s.safeAbsences, 'class', 'classes')} and stay at ${s.minimumPct}%`}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
