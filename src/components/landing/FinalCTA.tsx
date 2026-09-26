import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { CampusLogo } from '@/components/brand';
import { cn } from '@/lib/utils';
import { PixelSkyline, Sparkle } from './art';
import { Reveal } from './motion';
import s from './landing.module.css';

export function FinalCTA() {
  return (
    <section className="relative isolate overflow-hidden bg-[var(--lp-night)] px-5 pb-44 pt-24 text-center text-[var(--lp-cream)] sm:px-8 sm:pb-52 lg:pt-32" aria-labelledby="lp-final">
      <div className={cn(s.stars, 'pointer-events-none absolute inset-0 -z-10')} aria-hidden />
      <div className="pointer-events-none absolute left-1/2 top-24 -z-10 h-[360px] w-[680px] -translate-x-1/2 rounded-full bg-[#6d28d9] opacity-30 blur-[120px]" aria-hidden />
      <Reveal className="mx-auto max-w-[1040px]">
        <Sparkle size={18} className="mx-auto mb-6" />
        <h2 id="lp-final" className={cn(s.display, 'text-[clamp(40px,6.4vw,84px)]')}>
          Stop checking <span className="text-[var(--lp-yellow)]">five places.</span>
        </h2>
        <p className="mx-auto mt-6 max-w-[520px] text-[17px] leading-relaxed text-[#d9d3f5]">
          Your classes. Your people. Your opportunities. One place.
        </p>
        <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            href="/register"
            className={cn(
              s.focusRing,
              'inline-flex items-center gap-2 rounded-xl border-2 border-[#0b0920] bg-[var(--lp-yellow)] px-6 py-3.5 text-[16px] font-extrabold text-[var(--lp-ink)] shadow-[4px_4px_0_0_#f472b6] transition-transform hover:-translate-y-0.5',
            )}
          >
            Create student account <ArrowRight size={18} aria-hidden />
          </Link>
          <Link
            href="/login"
            className={cn(s.focusRing, 'rounded-xl border-[1.5px] border-white/25 px-6 py-3.5 text-[16px] font-bold transition-colors hover:border-white/60')}
          >
            Sign in
          </Link>
        </div>
      </Reveal>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-[150px] sm:h-[190px]" aria-hidden>
        <PixelSkyline className="h-full w-full" seed={3} />
      </div>
    </section>
  );
}

export function LandingFooter() {
  return (
    <footer className="bg-[#0b0920] px-5 py-10 text-[#b9b1e0] sm:px-8">
      <div className="mx-auto flex max-w-[1240px] flex-col gap-8 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CampusLogo size="sm" theme="dark" />
          <p className="mt-2 text-[13px] font-semibold text-[#d9d3f5]">Your Campus. All in One.</p>
          <p className="mt-3 text-[12px]">© {new Date().getFullYear()} CampusOS</p>
        </div>
        <nav aria-label="Footer">
          <ul className="flex flex-wrap gap-x-6 gap-y-2 text-[13.5px] font-semibold">
            {[
              { href: '#product', label: 'Product' },
              { href: '#students', label: 'Students' },
              { href: '#colleges', label: 'Colleges' },
              { href: '/login', label: 'Sign in' },
              { href: '/register', label: 'Create account' },
            ].map((l) => (
              <li key={l.label}>
                <a href={l.href} className={cn(s.focusRing, 'rounded hover:text-white')}>
                  {l.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </footer>
  );
}
