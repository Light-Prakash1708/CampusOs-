import Link from 'next/link';
import { ArrowRight, CheckCircle2 } from 'lucide-react';
import { PixelAvatar } from '@/components/campus';
import { cn } from '@/lib/utils';
import { Sparkle } from './art';
import { LandingRing } from './Ring';
import { Reveal } from './motion';
import s from './landing.module.css';

export function AttendanceShowcase() {
  return (
    <section className="relative isolate overflow-hidden bg-[var(--lp-night-2)] px-5 py-24 text-[var(--lp-cream)] sm:px-8 lg:py-32" aria-labelledby="lp-attendance">
      <div className={cn(s.stars, 'pointer-events-none absolute inset-0 -z-10 opacity-60')} aria-hidden />
      <div className="mx-auto grid max-w-[1240px] items-center gap-14 lg:grid-cols-[0.9fr_1.1fr]">
        <Reveal className="relative">
          <p className={cn(s.pixelText, 'text-[13px] uppercase text-[var(--lp-green)]')}>Attendance planner</p>
          <h2 id="lp-attendance" className={cn(s.display, 'mt-4 text-[clamp(42px,5.6vw,72px)]')}>
            Can I skip tomorrow?
          </h2>
          <p className="mt-6 max-w-[420px] text-[17px] leading-relaxed text-[#d9d3f5]">
            See what one missed class does to your attendance before you decide — and exactly how many classes it takes to
            get back above the line.
          </p>
          <Link
            href="/tools/attendance-planner"
            className={cn(
              s.focusRing,
              'mt-9 inline-flex items-center gap-2 rounded-xl border-2 border-[#0b0920] bg-[var(--lp-green)] px-5 py-3 text-[15px] font-extrabold text-[#052e16] shadow-[4px_4px_0_0_#0b0920] transition-transform hover:-translate-y-0.5',
            )}
          >
            Try the calculator <ArrowRight size={17} aria-hidden />
          </Link>
          <p className="mt-3 text-[12.5px] text-[#a79fd0]">Uses your own recorded attendance once you sign in.</p>
          <div className="pointer-events-none mt-10 hidden items-end gap-3 lg:flex" aria-hidden>
            <PixelAvatar tone="mint" size={56} />
            <div className={cn(s.note, '-rotate-3 rounded-md px-3 py-2 text-[13px]')}>
              Bunk smart,
              <br />
              not stressed
            </div>
          </div>
        </Reveal>

        <Reveal delay={120}>
          <div className="relative rounded-[22px] border-[1.5px] border-[#3b3372] bg-[#f7f2ff] p-5 text-[var(--lp-ink)] shadow-[0_40px_80px_-30px_rgb(0_0_0/0.7)] sm:p-7">
            <div className="flex flex-wrap items-center gap-6">
              <LandingRing value={82} size={132} stroke={14} track="#e3dcf6">
                <span className="text-[30px] font-extrabold leading-none tracking-tight">82%</span>
                <span className="mt-1 text-[11px] text-[var(--lp-muted)]">41 / 50</span>
              </LandingRing>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-bold text-[var(--lp-muted)]">Financial Management · this term</p>
                <p className="mt-1 text-[22px] font-extrabold leading-tight tracking-tight">You can miss 2 more classes.</p>
                <p className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-[var(--lp-green-soft)] px-2.5 py-1 text-[13px] font-bold text-[#15803d]">
                  <CheckCircle2 size={15} aria-hidden /> Still above your 75% target
                </p>
              </div>
            </div>

            <dl className="mt-7 grid grid-cols-3 gap-3">
              {[
                { k: 'Target', v: '75%' },
                { k: 'Safe to miss', v: '2' },
                { k: 'After missing 2', v: '78%' },
              ].map((x) => (
                <div key={x.k} className={cn(s.card, 'px-3 py-3')}>
                  <dt className="text-[11.5px] font-semibold text-[var(--lp-muted)]">{x.k}</dt>
                  <dd className="mt-0.5 text-[24px] font-extrabold leading-none tracking-tight">{x.v}</dd>
                </div>
              ))}
            </dl>

            <div className="mt-5">
              <div className="relative h-4 text-[11.5px] font-semibold text-[var(--lp-muted)]">
                <span className="absolute -translate-x-1/2" style={{ left: '75%' }}>Target 75%</span>
                <span className="absolute right-0">Now 82%</span>
              </div>
              <div className="relative mt-1.5 h-3 rounded-full border-[1.5px] border-[var(--lp-ink)] bg-white">
                <div className="h-full rounded-full bg-[var(--lp-green)]" style={{ width: '82%' }} />
                <span className="absolute -top-1 bottom-[-4px] w-0.5 bg-[var(--lp-ink)]" style={{ left: '75%' }} aria-hidden />
              </div>
            </div>
            <p className="mt-4 text-[11.5px] text-[var(--lp-muted)]">Example numbers.</p>
            <Sparkle size={16} color="#fbbf24" className="absolute -right-2 -top-2" />
          </div>
        </Reveal>
      </div>
    </section>
  );
}
