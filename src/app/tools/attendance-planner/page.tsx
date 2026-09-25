import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, BellRing, Download, LineChart } from 'lucide-react';
import { requireStudentContext } from '@/app/student/_lib/auth';
import { CampusComingSoon, CampusEmptyState, CampusSpeech, PixelAvatar, avatarToneFor } from '@/components/campus';
import { getAttendanceOverview } from '@/services/attendance';
import { Planner } from './Planner';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Attendance Planner' };

/**
 * ATTENDANCE PLANNER ("Bunk Calculator") — planning and risk awareness on the
 * student's own recorded attendance. Read-only. Framed around buffers and
 * recovery, never around skipping.
 */
export default async function AttendancePlannerPage({ searchParams }: { searchParams: Promise<{ subject?: string }> }) {
  const user = await requireStudentContext('attendance:view_own');
  const data = await getAttendanceOverview(user);
  if (!data.plannerEnabled) notFound();
  const { subject } = await searchParams;
  const initialScope = subject && data.subjects.some((s) => s.offeringId === subject) ? subject : 'overall';
  const hasData = data.overall.held > 0;

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <Link href="/tools" className="inline-flex items-center gap-1 text-[13px] font-bold text-muted hover:text-default">
            <ArrowLeft size={14} aria-hidden /> Tools
          </Link>
          <h1 className="mt-1 font-display text-[28px] font-extrabold leading-tight text-default sm:text-[34px]">Attendance Planner</h1>
          <p className="text-[13px] font-bold text-sun-ink">Bunk Calculator</p>
          <p className="mt-1 max-w-xl text-[13.5px] text-muted">Know exactly how many classes you can safely miss — and exactly what it takes to recover.</p>
        </div>
        <div className="hidden items-center gap-3 sm:flex" aria-hidden>
          <CampusSpeech>Plan smart. Stay above the line.</CampusSpeech>
          <PixelAvatar tone={avatarToneFor(user.userId)} size={56} />
        </div>
      </header>

      {!hasData ? (
        <CampusEmptyState
          sprite="student"
          title="No attendance recorded yet"
          description="The planner works from the classes your faculty have marked. It starts as soon as the first register is submitted."
          action={
            <Link href="/student/attendance" className="inline-flex min-h-[44px] items-center rounded-xl border-[1.5px] border-ink bg-surface px-4 text-[13px] font-bold shadow-pop campus-press">
              Open Attendance Tracker
            </Link>
          }
        />
      ) : (
        <Planner
          subjects={data.subjects.map((s) => ({
            offeringId: s.offeringId,
            name: s.name,
            code: s.code,
            held: s.held,
            attended: s.attended,
            minimumPct: s.minimumPct,
            remaining: s.remaining,
          }))}
          overall={{ held: data.overall.held, attended: data.overall.attended }}
          overallMinimumPct={data.policy.aggregateMinimumPct ?? data.policy.defaultMinimumPct}
          overallIsRule={data.policy.aggregateMinimumPct !== null}
          initialScope={initialScope}
        />
      )}

      <section aria-label="More" className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border-[1.5px] border-dashed border-[hsl(var(--border-strong))] bg-surface p-4">
          <p className="flex items-center gap-2 text-[14px] font-extrabold text-default">
            <BellRing size={17} aria-hidden /> Smart reminders
          </p>
          <p className="mt-1 text-[12.5px] text-muted">Get told when a subject is getting close to its minimum.</p>
          <CampusComingSoon label="Coming in Phase 3" className="mt-2" />
        </div>
        <Link href="/student/attendance" className="rounded-2xl border-[1.5px] border-ink bg-sky p-4 shadow-pop campus-press">
          <p className="flex items-center gap-2 text-[14px] font-extrabold text-default">
            <LineChart size={17} aria-hidden /> Trend & history
          </p>
          <p className="mt-1 text-[12.5px] text-muted">Week-by-week attendance and every marked class, subject by subject.</p>
        </Link>
        {hasData ? (
          <a href="/api/attendance/export" className="rounded-2xl border-[1.5px] border-ink bg-lavender p-4 shadow-pop campus-press">
            <p className="flex items-center gap-2 text-[14px] font-extrabold text-default">
              <Download size={17} aria-hidden /> Export report
            </p>
            <p className="mt-1 text-[12.5px] text-muted">Download your attendance history as a CSV file.</p>
          </a>
        ) : null}
      </section>
    </div>
  );
}
