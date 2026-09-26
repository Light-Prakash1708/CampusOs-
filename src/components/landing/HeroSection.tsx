import Link from 'next/link';
import { ArrowRight, BookOpen, CalendarDays, CheckSquare, Compass, GraduationCap, Home, LibraryBig, Megaphone, Search, Sparkles, Target, Ticket } from 'lucide-react';
import { CampusMark } from '@/components/brand';
import { PixelAvatar } from '@/components/campus';
import { cn } from '@/lib/utils';
import { PixelSkyline, Sparkle } from './art';
import { LandingRing } from './Ring';
import { Parallax, Reveal } from './motion';
import s from './landing.module.css';

const CLASSES = [
  { time: '09:00', name: 'Financial Management', room: 'Room 302', tone: '#a78bfa' },
  { time: '11:00', name: 'Economics', room: 'Room 204', tone: '#60a5fa' },
  { time: '14:00', name: 'Business Communication', room: 'Room 101', tone: '#fb7185' },
];

const SIDEBAR = [
  { icon: Home, label: 'Home', active: true },
  { icon: CalendarDays, label: 'Classes' },
  { icon: CheckSquare, label: 'Attendance' },
  { icon: Ticket, label: 'Events' },
  { icon: LibraryBig, label: 'Library' },
  { icon: Target, label: 'Career' },
  { icon: Sparkles, label: 'Assistant' },
];

export function HeroSection() {
  return (
    <section className="relative isolate overflow-hidden bg-[var(--lp-night)] text-[var(--lp-cream)]">
      <div className={cn(s.stars, 'pointer-events-none absolute inset-0 -z-10 opacity-80')} aria-hidden />
      <div
        className="pointer-events-none absolute -right-40 -top-40 -z-10 h-[520px] w-[520px] rounded-full bg-[#4c1d95] opacity-40 blur-[120px]"
        aria-hidden
      />

      <Parallax className="mx-auto grid max-w-[1240px] gap-12 px-5 pb-28 pt-28 sm:px-8 md:pt-32 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] xl:items-center xl:gap-10 xl:pb-36 xl:pt-36">
        {/* Copy */}
        <div className="relative max-w-[600px]">
          <p className={cn(s.pixelText, 'text-[12px] uppercase text-[var(--lp-lav)] sm:text-[13px]')}>
            Classes · Attendance · Events · Library · Career
          </p>
          <h1 className={cn(s.display, 'mt-5 text-[clamp(48px,8vw,80px)] xl:text-[clamp(64px,5.4vw,80px)] text-[var(--lp-cream)]')}>
            Your campus.
            <br />
            <span className={cn(s.underline, 'text-[var(--lp-yellow)]')}>
              One place.
              <svg viewBox="0 0 300 20" preserveAspectRatio="none" aria-hidden focusable="false">
                <path d="M4 14 C 60 4, 120 18, 180 9 S 270 6, 296 12" fill="none" stroke="#f472b6" strokeWidth="6" strokeLinecap="round" />
              </svg>
            </span>
          </h1>
          <p className="mt-8 max-w-[480px] text-[17px] leading-relaxed text-[#d9d3f5] sm:text-[18px]">
            Your timetable, attendance, notices, events, library and opportunities, together — instead of scattered across
            WhatsApp groups, spreadsheets and five different portals.
          </p>
          <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Link
              href="/register"
              className={cn(
                s.focusRing,
                'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl border-2 border-[#0b0920] bg-[var(--lp-yellow)] px-6 py-3.5 text-[16px] font-extrabold text-[var(--lp-ink)] shadow-[4px_4px_0_0_#f472b6] transition-transform hover:-translate-y-0.5',
              )}
            >
              Create your student account <ArrowRight size={18} aria-hidden />
            </Link>
            <a
              href="#product"
              className={cn(
                s.focusRing,
                'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl border-[1.5px] border-white/25 px-6 py-3.5 text-[16px] font-bold text-white transition-colors hover:border-white/60',
              )}
            >
              Explore CampusOS
            </a>
          </div>
          <ul className="mt-7 flex flex-wrap gap-x-5 gap-y-2 text-[13px] font-medium text-[#b9b1e0]">
            {['Free for students', 'Start without your college', 'Your college can invite you later'].map((t) => (
              <li key={t} className="flex items-center gap-2">
                <Sparkle size={9} color="#a78bfa" />
                {t}
              </li>
            ))}
          </ul>
        </div>

        {/* Product preview */}
        <Reveal delay={120} className="relative mx-auto w-full max-w-[720px] xl:max-w-none">
          <ProductPreview />
          <div className={cn(s.depth2, 'pointer-events-none absolute -left-6 -top-8 hidden lg:block')} aria-hidden>
            <Sparkle size={18} color="#fbbf24" />
          </div>
          <div className={cn(s.depth3, 'pointer-events-none absolute -right-3 top-1/3 hidden lg:block')} aria-hidden>
            <Sparkle size={12} color="#a78bfa" />
          </div>
        </Reveal>
      </Parallax>

      {/* Campus at dusk */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-[120px] sm:h-[150px]" aria-hidden>
        <PixelSkyline className="h-full w-full" seed={11} />
      </div>
    </section>
  );
}

function ProductPreview() {
  return (
    <figure className="relative" aria-label="Preview of the CampusOS student home, with sample data">
      <div className={cn(s.depth1, 'overflow-hidden rounded-[20px] border-[1.5px] border-[#3b3372] bg-[#f7f2ff] shadow-[0_40px_80px_-30px_rgb(0_0_0/0.7)]')}>
        {/* Window bar */}
        <div className="flex items-center gap-3 border-b border-[#e3dcf6] bg-white/80 px-4 py-2.5">
          <div className="flex gap-1.5" aria-hidden>
            <span className="h-2.5 w-2.5 rounded-full bg-[#fb7185]" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#fbbf24]" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#22c55e]" />
          </div>
          <div className="mx-auto flex min-w-0 max-w-[260px] flex-1 items-center gap-2 rounded-lg bg-[#f1ecfb] px-3 py-1 text-[11px] text-[#7b769b]">
            <Search size={11} aria-hidden /> <span className="truncate">Search classes, events, people…</span>
          </div>
          <PixelAvatar tone="lavender" size={20} />
        </div>

        <div className="flex">
          {/* Sidebar */}
          <div className="hidden w-[132px] shrink-0 border-r border-[#e3dcf6] bg-white/60 p-2.5 sm:block">
            <div className="flex items-center gap-1.5 px-1.5 pb-3 pt-1">
              <CampusMark height={16} />
              <span className="text-[12px] font-extrabold tracking-tight text-[var(--lp-ink)]">
                Campus<span className="text-[#8b5cf6]">O</span>
                <span className="text-[#16a34a]">S</span>
              </span>
            </div>
            <ul className="space-y-0.5">
              {SIDEBAR.map(({ icon: Icon, label, active }) => (
                <li
                  key={label}
                  className={cn(
                    'flex items-center gap-2 rounded-lg px-2 py-1.5 text-[11.5px] font-semibold',
                    active ? 'bg-[var(--lp-ink)] text-white' : 'text-[#5b5877]',
                  )}
                >
                  <Icon size={13} aria-hidden /> {label}
                </li>
              ))}
            </ul>
          </div>

          {/* Home */}
          <div className="min-w-0 flex-1 p-3.5 sm:p-4">
            <p className="text-[16px] font-extrabold tracking-tight text-[var(--lp-ink)] sm:text-[18px]">Good morning, Prakash 👋</p>
            <p className="text-[11px] text-[#7b769b]">Saturday · 3 classes · 1 task due soon</p>

            <div className="mt-3 grid grid-cols-1 gap-2.5 min-[480px]:grid-cols-[1.35fr_1fr]">
              <div className={cn(s.card, 'p-3')}>
                <div className="flex items-center justify-between">
                  <p className="text-[11.5px] font-extrabold text-[var(--lp-ink)]">Today&apos;s classes</p>
                  <span className="text-[10px] font-bold text-[#8b5cf6]">View all</span>
                </div>
                <ul className="mt-2 space-y-1.5">
                  {CLASSES.map((c) => (
                    <li key={c.time} className="flex items-center gap-2 text-[11px]">
                      <span className="h-6 w-1 rounded-full" style={{ background: c.tone }} aria-hidden />
                      <span className="w-9 font-bold tabular-nums text-[var(--lp-ink)]">{c.time}</span>
                      <span className="min-w-0 flex-1 truncate font-semibold text-[#3d3a5c]">{c.name}</span>
                      <span className="hidden text-[10px] text-[#7b769b] min-[400px]:inline">{c.room}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className={cn(s.card, 'flex items-center gap-3 p-3')}>
                <LandingRing value={82} size={62} stroke={7}>
                  <span className="text-[14px] font-extrabold text-[var(--lp-ink)]">82%</span>
                </LandingRing>
                <div className="min-w-0">
                  <p className="text-[11.5px] font-extrabold text-[var(--lp-ink)]">Attendance</p>
                  <p className="text-[10.5px] text-[#5b5877]">41 of 50 classes</p>
                  <p className="mt-1 rounded-md bg-[var(--lp-green-soft)] px-1.5 py-0.5 text-[10px] font-bold text-[#15803d]">Above your 75% target</p>
                </div>
              </div>
            </div>

            <div className="mt-2.5 hidden grid-cols-3 gap-2.5 min-[480px]:grid">
              <div className={cn(s.card, 'p-2.5')}>
                <p className="text-[10.5px] font-extrabold text-[var(--lp-ink)]">Campus pulse</p>
                <div className="mt-1.5 grid grid-cols-3 text-center">
                  {[
                    { n: 4, l: 'notices', i: Megaphone, c: '#fb7185' },
                    { n: 2, l: 'events', i: Ticket, c: '#8b5cf6' },
                    { n: 3, l: 'openings', i: Compass, c: '#0ea5e9' },
                  ].map(({ n, l, i: I, c }) => (
                    <div key={l}>
                      <I size={12} className="mx-auto" style={{ color: c }} aria-hidden />
                      <p className="text-[13px] font-extrabold leading-tight text-[var(--lp-ink)]">{n}</p>
                      <p className="text-[9px] text-[#7b769b]">{l}</p>
                    </div>
                  ))}
                </div>
              </div>
              <div className={cn(s.card, 'p-2.5')}>
                <p className="text-[10.5px] font-extrabold text-[var(--lp-ink)]">Upcoming</p>
                <p className="mt-1.5 text-[11px] font-bold leading-snug text-[#3d3a5c]">Business Analytics Workshop</p>
                <p className="text-[9.5px] text-[#7b769b]">Tomorrow · 2:00 PM</p>
              </div>
              <div className={cn(s.card, 'p-2.5')}>
                <p className="text-[10.5px] font-extrabold text-[var(--lp-ink)]">Your tasks</p>
                <p className="mt-1.5 text-[11px] font-bold leading-snug text-[#3d3a5c]">Submit assignment</p>
                <p className="text-[9.5px] font-semibold text-[#e11d48]">Due in 2 days</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Floating layers */}
      <div className={cn(s.depth3, '-bottom-7 -left-5 hidden lg:block', 'absolute')} aria-hidden>
        <div className={cn(s.card, s.float, 'flex items-center gap-2.5 px-3 py-2.5')}>
          <BookOpen size={16} className="text-[#8b5cf6]" />
          <div>
            <p className="text-[11px] font-extrabold text-[var(--lp-ink)]">Notes saved</p>
            <p className="text-[10px] text-[#5b5877]">Macroeconomics · Unit 3 PYQs</p>
          </div>
        </div>
      </div>
      <div className={cn(s.depth2, 'absolute -right-4 -top-6 hidden lg:block')} aria-hidden>
        <div className={cn(s.note, s.floatSlow, 'rotate-[4deg] rounded-md px-3 py-2 text-[12px]')}>
          Study · Plan
          <br />
          Attend · Grow
        </div>
      </div>
      <div className={cn(s.depth1, 'absolute -bottom-9 right-6 hidden items-end gap-1 lg:flex')} aria-hidden>
        <PixelAvatar tone="indigo" size={46} />
        <GraduationCap size={18} className="mb-2 text-[var(--lp-yellow)]" />
      </div>
      <figcaption className="sr-only">Sample data for illustration.</figcaption>
    </figure>
  );
}
