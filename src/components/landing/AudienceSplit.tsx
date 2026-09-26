import Link from 'next/link';
import { ArrowRight, Check } from 'lucide-react';
import { CampusMark } from '@/components/brand';
import { PixelAvatar } from '@/components/campus';
import { cn } from '@/lib/utils';
import { Reveal } from './motion';
import s from './landing.module.css';

export function AudienceSplit({ demo = false }: { demo?: boolean }) {
  return (
    <section className="bg-[var(--lp-cream)] px-5 py-24 sm:px-8 lg:py-28" aria-label="For students and colleges">
      <div className="mx-auto grid max-w-[1240px] gap-5 lg:grid-cols-2">
        <Reveal id="students" className="scroll-mt-24">
          <div className={cn(s.card, 'relative h-full overflow-hidden bg-[#ecfccb] p-7 sm:p-9')}>
            <p className={cn(s.pixelText, 'text-[13px] uppercase text-[#3f6212]')}>For students</p>
            <h2 className="mt-3 text-[30px] font-extrabold leading-tight tracking-tight">Start your campus journey.</h2>
            <ul className="mt-5 space-y-2.5 text-[15px]">
              {['Create your own account', 'Use CampusOS on your own', 'Your college can invite you later', 'Planner, tracker, events and career tools'].map((t) => (
                <li key={t} className="flex items-start gap-2.5">
                  <Check size={18} className="mt-0.5 shrink-0 text-[#15803d]" aria-hidden /> {t}
                </li>
              ))}
            </ul>
            <Link
              href="/register"
              className={cn(
                s.focusRing,
                'mt-8 inline-flex items-center gap-2 rounded-xl border-2 border-[var(--lp-ink)] bg-[var(--lp-yellow)] px-5 py-3 text-[15px] font-extrabold shadow-[3px_3px_0_0_var(--lp-ink)] transition-transform hover:-translate-y-0.5',
              )}
            >
              Create student account <ArrowRight size={17} aria-hidden />
            </Link>
            <PixelAvatar tone="mint" size={72} className="pointer-events-none absolute -bottom-1 right-6 hidden sm:block" />
          </div>
        </Reveal>

        <Reveal id="colleges" delay={100} className="scroll-mt-24">
          <div className={cn(s.card, 'relative h-full overflow-hidden bg-[var(--lp-blue-soft)] p-7 sm:p-9')}>
            <p className={cn(s.pixelText, 'text-[13px] uppercase text-[#1d4ed8]')}>For colleges</p>
            <h2 className="mt-3 text-[30px] font-extrabold leading-tight tracking-tight">Run a pilot alongside your ERP.</h2>
            <ul className="mt-5 space-y-2.5 text-[15px]">
              {[
                'Keep your ERP — bring students and classes in from a CSV',
                'Notices that ask for a confirmation, with proof of who acknowledged',
                'A grievance workflow aligned with the UGC 2023 timelines',
                'Attendance students can see, and an evidence pack for your IQAC',
              ].map((t) => (
                <li key={t} className="flex items-start gap-2.5">
                  <Check size={18} className="mt-0.5 shrink-0 text-[#1d4ed8]" aria-hidden /> {t}
                </li>
              ))}
            </ul>
            <p className="mt-8 max-w-[440px] text-[14px] leading-relaxed text-[var(--lp-muted)]">
              Colleges start with a one-semester pilot, set up with the CampusOS team.{' '}
              {demo ? (
                <>
                  <Link href="/login#demo-h" className="font-bold text-[#1d4ed8] underline-offset-2 hover:underline">
                    Try the demo college
                  </Link>{' '}
                  first, or sign in if you’re already set up.
                </>
              ) : (
                'Already set up?'
              )}
            </p>
            <Link
              href="/login"
              className={cn(
                s.focusRing,
                'mt-3 inline-flex items-center gap-2 rounded-xl border-2 border-[var(--lp-ink)] bg-white px-5 py-3 text-[15px] font-extrabold shadow-[3px_3px_0_0_var(--lp-ink)] transition-transform hover:-translate-y-0.5',
              )}
            >
              Sign in to your college <ArrowRight size={17} aria-hidden />
            </Link>
            <CampusMark height={60} className="pointer-events-none absolute -bottom-1 right-6 hidden sm:block" />
          </div>
        </Reveal>
      </div>
    </section>
  );
}
