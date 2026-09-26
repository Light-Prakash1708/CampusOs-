import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { PixelBadge, PixelFlame, PixelRobot } from '@/components/campus';
import { cn } from '@/lib/utils';
import { LandingRing } from './Ring';
import { Reveal } from './motion';
import s from './landing.module.css';

const MODULES: {
  key: string;
  verb: string;
  what: string;
  line: string;
  bg: string;
  accent: string;
  snippet: React.ReactNode;
}[] = [
  {
    key: 'attend',
    verb: 'Attend',
    what: 'Attendance & bunk calculator',
    line: 'Know exactly where you stand in every subject.',
    bg: 'var(--lp-green-soft)',
    accent: '#15803d',
    snippet: (
      <div className="flex items-center gap-3">
        <LandingRing value={82} size={56} stroke={7} animate={false}>
          <span className="text-[13px] font-extrabold">82%</span>
        </LandingRing>
        <div className="text-[12px] leading-snug">
          <p className="font-extrabold">41 / 50 classes</p>
          <p className="text-[#15803d]">2 safe to miss</p>
        </div>
      </div>
    ),
  },
  {
    key: 'plan',
    verb: 'Plan',
    what: 'Timetable, tasks & goals',
    line: 'Your day, your deadlines and your own goals in one list.',
    bg: '#fce7f3',
    accent: '#be185d',
    snippet: (
      <div className="grid grid-cols-3 gap-1.5 text-center">
        {[
          ['3', 'classes'],
          ['2', 'tasks'],
          ['1', 'deadline'],
        ].map(([n, l]) => (
          <div key={l} className="rounded-lg border-[1.5px] border-[var(--lp-ink)] bg-white/70 py-1.5">
            <p className="text-[17px] font-extrabold leading-none">{n}</p>
            <p className="mt-0.5 text-[10.5px] text-[var(--lp-muted)]">{l}</p>
          </div>
        ))}
      </div>
    ),
  },
  {
    key: 'discover',
    verb: 'Discover',
    what: 'Events, fests & workshops',
    line: 'What’s on at your college, and what’s open to everyone.',
    bg: 'var(--lp-blue-soft)',
    accent: '#1d4ed8',
    snippet: (
      <div className="space-y-1.5 text-[11.5px]">
        {['Hackathon · Sat', 'Design workshop · Tue'].map((e) => (
          <p key={e} className="flex items-center gap-2 rounded-lg border-[1.5px] border-[var(--lp-ink)] bg-white/70 px-2 py-1 font-bold">
            <span className="h-2 w-2 rounded-full bg-[#60a5fa]" aria-hidden /> {e}
          </p>
        ))}
      </div>
    ),
  },
  {
    key: 'access',
    verb: 'Access',
    what: 'Library, notes & PYQs',
    line: 'Find the book, the notes and last year’s paper without asking around.',
    bg: 'var(--lp-yellow-soft)',
    accent: '#a16207',
    snippet: (
      <div className="flex items-end gap-1" aria-hidden>
        {[
          ['#a78bfa', 34],
          ['#fb7185', 44],
          ['#60a5fa', 38],
          ['#22c55e', 48],
          ['#fbbf24', 30],
        ].map(([c, h], i) => (
          <span key={i} className="w-5 rounded-t-sm border-[1.5px] border-[var(--lp-ink)]" style={{ background: c as string, height: h as number }} />
        ))}
        <span className="ml-2 text-[11.5px] font-bold">Unit 3 PYQs saved</span>
      </div>
    ),
  },
  {
    key: 'grow',
    verb: 'Grow',
    what: 'Career & opportunities',
    line: 'Track internships and applications, and build a streak of progress.',
    bg: 'var(--lp-lav-soft)',
    accent: '#6d28d9',
    snippet: (
      <div className="flex items-center gap-2.5">
        <PixelFlame size={30} />
        <div className="text-[12px] leading-snug">
          <p className="font-extrabold">12-day streak</p>
          <p className="text-[var(--lp-muted)]">3 applications in progress</p>
        </div>
        <PixelBadge icon="star" color="indigo" size={30} className="ml-auto" />
      </div>
    ),
  },
  {
    key: 'ask',
    verb: 'Ask',
    what: 'CampusOS assistant',
    line: 'Ask about your timetable, attendance or deadlines in plain words.',
    bg: 'var(--lp-coral-soft)',
    accent: '#be123c',
    snippet: (
      <div className="flex items-start gap-2">
        <PixelRobot size={30} />
        <p className="rounded-xl rounded-tl-sm border-[1.5px] border-[var(--lp-ink)] bg-white px-2.5 py-1.5 text-[11.5px] font-semibold leading-snug">
          “When is my next Economics class?”
        </p>
      </div>
    ),
  },
];

export function ProductModules() {
  return (
    <section id="product" className="scroll-mt-24 bg-[var(--lp-paper)] px-5 py-24 sm:px-8 lg:py-28" aria-labelledby="lp-product">
      <div className="mx-auto max-w-[1240px]">
        <Reveal className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <h2 id="lp-product" className={cn(s.display, 'max-w-[620px] text-[clamp(36px,4.6vw,56px)]')}>
            Everything you need for campus life.
          </h2>
          <p className="max-w-[330px] text-[15.5px] leading-relaxed text-[var(--lp-muted)]">
            Six everyday jobs, one account. Built around what students actually check every day.
          </p>
        </Reveal>

        <ul className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 lg:gap-5">
          {MODULES.map((m, i) => (
            <Reveal as="li" key={m.key} delay={(i % 3) * 80}>
              <Link
                href="/register"
                className={cn(s.card, s.lift, s.focusRing, 'group flex h-full flex-col p-5')}
                style={{ background: m.bg }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className={cn(s.pixelText, 'text-[20px] uppercase leading-none')} style={{ color: m.accent }}>
                      {m.verb}
                    </p>
                    <h3 className="mt-2 text-[17px] font-extrabold tracking-tight">{m.what}</h3>
                  </div>
                  <ArrowUpRight size={20} className={cn(s.nudge, 'shrink-0')} aria-hidden />
                </div>
                <p className="mt-1.5 text-[13.5px] leading-snug text-[var(--lp-muted)]">{m.line}</p>
                <div className="mt-auto pt-5 text-[var(--lp-ink)]">
                  <div className="rounded-xl border border-dashed border-[var(--lp-ink)]/25 bg-white/40 p-3">{m.snippet}</div>
                </div>
              </Link>
            </Reveal>
          ))}
        </ul>
        <p className="mt-5 text-[12px] text-[var(--lp-muted)]">Numbers shown are examples.</p>
      </div>
    </section>
  );
}
