import { CalendarDays, CheckSquare, Square } from 'lucide-react';
import { PixelAvatar, PixelFlame } from '@/components/campus';
import { cn } from '@/lib/utils';
import { Sparkle } from './art';
import { Reveal } from './motion';
import s from './landing.module.css';

const GOALS = [
  { t: 'Complete Financial Management notes', done: true },
  { t: 'Prepare for midsems', done: false },
  { t: 'Apply to 3 internships', done: false },
  { t: 'Read 2 research papers', done: false },
];

export function PersonalDashboard() {
  return (
    <section className="relative overflow-hidden bg-[var(--lp-lav-soft)] px-5 py-24 sm:px-8 lg:py-28" aria-labelledby="lp-personal">
      <div className="mx-auto max-w-[1240px]">
        <Reveal className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 id="lp-personal" className={cn(s.display, 'text-[clamp(36px,4.6vw,56px)]')}>
              Your campus, but personal.
            </h2>
            <p className="mt-4 max-w-[460px] text-[16px] leading-relaxed text-[var(--lp-muted)]">
              Your home shows your classes, your deadlines and the goals you set yourself — nobody else&apos;s.
            </p>
          </div>
          <div className={cn(s.note, 'hidden rotate-[3deg] self-start rounded-md px-3 py-2 text-[13px] sm:block')} aria-hidden>
            Track · Learn
            <br />
            Build · Grow
          </div>
        </Reveal>

        <Reveal delay={120} className="mt-12">
          <figure
            aria-label="Preview of a personal CampusOS home, with sample data"
            className="overflow-hidden rounded-[22px] border-[1.5px] border-[var(--lp-ink)] bg-[var(--lp-paper)] shadow-[8px_10px_0_0_var(--lp-ink)]"
          >
            <div className="flex items-center justify-between border-b-[1.5px] border-[var(--lp-ink)] bg-white px-5 py-3">
              <p className="text-[15px] font-extrabold tracking-tight sm:text-[17px]">Good evening, Prakash 👋</p>
              <p className="hidden text-[12px] text-[var(--lp-muted)] sm:block">Keep going — you&apos;re doing great.</p>
            </div>

            <div className="grid gap-4 p-4 sm:p-6 lg:grid-cols-[1.35fr_1fr]">
              <div className="space-y-4">
                <div className={cn(s.card, 'flex flex-wrap items-center gap-4 p-4')}>
                  <PixelAvatar tone="indigo" size={56} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[16px] font-extrabold">Prakash Raj</p>
                    <p className="text-[12.5px] text-[var(--lp-muted)]">BBA · 1st year</p>
                  </div>
                  <span className="rounded-lg border-[1.5px] border-[var(--lp-ink)] px-2.5 py-1 text-[12px] font-bold">Edit profile</span>
                </div>
                <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {[
                    { v: '12', k: 'Day streak', icon: <PixelFlame size={22} /> },
                    { v: '5', k: 'Tasks left', icon: <CheckSquare size={18} className="text-[#16a34a]" aria-hidden /> },
                    { v: '3', k: 'Events this week', icon: <CalendarDays size={18} className="text-[#7c3aed]" aria-hidden /> },
                    { v: '87%', k: 'Attendance', icon: <Sparkle size={16} color="#22c55e" /> },
                  ].map((x) => (
                    <div key={x.k} className={cn(s.card, 'p-3')}>
                      <div className="h-6">{x.icon}</div>
                      <dd className="mt-1 text-[24px] font-extrabold leading-none tracking-tight">{x.v}</dd>
                      <dt className="mt-1 text-[11.5px] text-[var(--lp-muted)]">{x.k}</dt>
                    </div>
                  ))}
                </dl>
              </div>

              <div className={cn(s.card, 'p-4')}>
                <p className="text-[14px] font-extrabold">My goals</p>
                <ul className="mt-3 space-y-2.5">
                  {GOALS.map((g) => (
                    <li key={g.t} className="flex items-start gap-2.5 text-[13.5px]">
                      {g.done ? (
                        <CheckSquare size={17} className="mt-0.5 shrink-0 text-[#16a34a]" aria-label="Done" />
                      ) : (
                        <Square size={17} className="mt-0.5 shrink-0 text-[var(--lp-ink)]/50" aria-label="Not done" />
                      )}
                      <span className={g.done ? 'text-[var(--lp-muted)] line-through' : 'font-semibold'}>{g.t}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <figcaption className="px-6 pb-4 text-[11.5px] text-[var(--lp-muted)]">Sample data for illustration.</figcaption>
          </figure>
        </Reveal>
      </div>
    </section>
  );
}
