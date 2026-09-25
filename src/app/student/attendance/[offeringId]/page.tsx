import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, ArrowRight, Calculator, Flag } from 'lucide-react';
import { CampusCard, CampusRing, CampusSectionHeader, CampusStat } from '@/components/campus';
import { AdvisorList, AttendanceTrend, RiskBadge, riskTone } from '@/components/campus/attendance';
import { bestCase, formatPct } from '@/lib/attendance/planner';
import { isEnabled } from '@/lib/features';
import { cn, pluralize } from '@/lib/utils';
import { getSubjectAttendance, type RecordStatus } from '@/services/attendance';
import { NotFoundError } from '@/lib/api';
import { requireStudentContext } from '../../_lib/auth';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Subject attendance' };

const STATUS: Record<RecordStatus, { label: string; cls: string; note: string }> = {
  PRESENT: { label: 'Present', cls: 'bg-mint text-mint-ink', note: 'Counts as attended' },
  LATE: { label: 'Late', cls: 'bg-sun text-sun-ink', note: 'Counts as attended' },
  ABSENT: { label: 'Absent', cls: 'bg-coral text-coral-ink', note: 'Counts as missed' },
  MEDICAL: { label: 'Medical', cls: 'bg-peach text-peach-ink', note: 'Held, not attended' },
  EXCUSED: { label: 'Excused', cls: 'bg-sky text-sky-ink', note: 'Not counted' },
};

function dateLabel(iso: string) {
  return new Intl.DateTimeFormat('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`));
}

export default async function SubjectAttendancePage({ params }: { params: Promise<{ offeringId: string }> }) {
  const user = await requireStudentContext('attendance:view_own');
  const { offeringId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(offeringId)) notFound();
  const detail = await getSubjectAttendance(user, offeringId).catch((e) => {
    if (e instanceof NotFoundError) notFound();
    throw e;
  });
  const { subject: s, history, trend } = detail;
  const grievanceOn = isEnabled(user.featureFlags, 'grievance_enabled');
  const best = s.remaining !== null ? bestCase(s, s.remaining) : null;
  const dispute = `/student/redressal/new?${new URLSearchParams({ category: 'attendance', offering: s.offeringId, subject: s.code }).toString()}`;

  return (
    <div className="space-y-5">
      <Link href="/student/attendance?view=subjects" className="inline-flex items-center gap-1 text-[13px] font-bold text-muted hover:text-default">
        <ArrowLeft size={14} aria-hidden /> All subjects
      </Link>

      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-[24px] font-extrabold leading-tight text-default sm:text-[30px]">{s.name}</h1>
          <p className="mt-1 text-[13px] text-muted">
            {s.code}
            {s.facultyName ? ` · ${s.facultyName}` : ''} · minimum {s.minimumPct}% set by your college
          </p>
        </div>
        <RiskBadge state={s.risk} className="text-[12.5px]" />
      </header>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <CampusCard as="section" className="p-4 sm:p-5" aria-labelledby="now-h">
          <CampusSectionHeader id="now-h" title="Where you stand" />
          <div className="mt-4 flex flex-col items-center gap-5 sm:flex-row">
            <CampusRing value={s.percentBp === null ? null : s.percentBp / 100} label={`${s.name} attendance`} sublabel="attendance" tone={riskTone(s.risk)} marker={s.minimumPct} size={140} emptyLabel="No classes yet" />
            <div className="grid w-full grid-cols-2 gap-2.5">
              <CampusStat label="Held" value={s.held} tone="lavender" />
              <CampusStat label="Attended" value={s.attended} tone="mint" />
              <CampusStat label="Missed" value={s.missed} tone="coral" />
              <CampusStat label="Excused" value={s.excused} tone="sky" hint="not counted" />
            </div>
          </div>
          <dl className="mt-4 grid grid-cols-1 gap-2 text-[13px] sm:grid-cols-2">
            <div className="rounded-xl border-[1.5px] border-ink bg-surface p-3">
              <dt className="text-[11.5px] font-bold uppercase tracking-wide text-subtle">{s.classesToMinimum ? 'To get back to the minimum' : 'Buffer above the minimum'}</dt>
              <dd className="mt-0.5 font-extrabold text-default">
                {s.held === 0
                  ? 'Starts once a class is marked'
                  : s.classesToMinimum === null
                    ? 'Not reachable'
                    : s.classesToMinimum > 0
                      ? `Attend the next ${pluralize(s.classesToMinimum, 'class', 'classes')}`
                      : s.safeAbsences === 0
                        ? 'None — don’t miss the next class'
                        : `${pluralize(s.safeAbsences, 'class', 'classes')} — keep it for emergencies`}
              </dd>
            </div>
            <div className="rounded-xl border-[1.5px] border-ink bg-surface p-3">
              <dt className="text-[11.5px] font-bold uppercase tracking-wide text-subtle">Rest of the term</dt>
              <dd className="mt-0.5 font-extrabold text-default">
                {s.remaining === null ? 'No published schedule' : `${pluralize(s.remaining, 'class', 'classes')} scheduled`}
                {best !== null && s.remaining ? <span className="block text-[12px] font-semibold text-muted">Best possible: {formatPct(best)}</span> : null}
              </dd>
            </div>
          </dl>
          <div className="mt-4 flex flex-wrap gap-2">
            {detail.plannerEnabled && s.held > 0 ? (
              <Link href={`/tools/attendance-planner?subject=${s.offeringId}`} className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border-[1.5px] border-ink bg-ink px-4 text-[13px] font-bold text-white shadow-pop campus-press">
                <Calculator size={15} aria-hidden /> Plan this subject
              </Link>
            ) : null}
            {grievanceOn ? (
              <Link href={dispute} className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border-[1.5px] border-ink bg-surface px-4 text-[13px] font-bold text-default shadow-pop campus-press">
                <Flag size={15} aria-hidden /> Dispute a record
              </Link>
            ) : null}
          </div>
        </CampusCard>

        <CampusCard as="section" className="p-4 sm:p-5" aria-labelledby="tr-h">
          <div className="flex items-baseline justify-between">
            <CampusSectionHeader id="tr-h" title="Trend" />
            <span className="text-[11.5px] font-semibold text-subtle">Last 10 weeks</span>
          </div>
          <div className="mt-6">
            <AttendanceTrend points={trend} minimumPct={s.minimumPct} title={`${s.name} weekly attendance`} />
          </div>
          {detail.advice.length ? (
            <div className="mt-4">
              <AdvisorList advice={detail.advice} disputeHref={grievanceOn ? dispute : null} />
            </div>
          ) : null}
        </CampusCard>
      </div>

      <CampusCard as="section" className="overflow-hidden" aria-labelledby="hist-h">
        <div className="flex items-baseline justify-between gap-2 p-4 pb-2 sm:px-5">
          <CampusSectionHeader id="hist-h" title="Attendance history" />
          <span className="text-[11.5px] font-semibold text-subtle">{pluralize(history.length, 'class', 'classes')} marked</span>
        </div>
        {history.length === 0 ? (
          <p className="px-4 pb-5 text-[13px] text-subtle sm:px-5">No registers have been submitted for this subject yet.</p>
        ) : (
          <ol className="divide-y divide-[hsl(var(--border))]">
            {history.map((h) => {
              const st = STATUS[h.status];
              return (
                <li key={h.recordId} className="flex items-center gap-3 px-4 py-2.5 sm:px-5">
                  <span className="w-[92px] shrink-0 text-[12.5px] font-semibold text-default">{dateLabel(h.date)}</span>
                  <span className={cn('w-[74px] shrink-0 rounded-md border border-ink/30 px-1.5 py-0.5 text-center text-[11.5px] font-bold', st.cls)}>{st.label}</span>
                  <span className="min-w-0 flex-1 truncate text-[12.5px] text-muted">
                    {h.topic ?? <span className="text-subtle">No topic recorded</span>}
                    {h.corrected ? (
                      <span className="ml-1.5 text-[11.5px] font-semibold text-sky-ink">
                        · corrected{h.originalStatus ? ` from ${STATUS[h.originalStatus].label.toLowerCase()}` : ''}
                      </span>
                    ) : null}
                  </span>
                  <span className="hidden text-[11px] text-subtle sm:block">{st.note}</span>
                </li>
              );
            })}
          </ol>
        )}
        {history.length >= 200 ? (
          <p className="border-t border-[hsl(var(--border))] px-4 py-2 text-[12px] text-subtle sm:px-5">
            Showing the latest 200.{' '}
            <a href="/api/attendance/export" className="font-bold text-brand hover:underline">
              Export everything <ArrowRight size={11} className="inline" aria-hidden />
            </a>
          </p>
        ) : null}
      </CampusCard>
    </div>
  );
}
