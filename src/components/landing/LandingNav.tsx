'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowRight, Menu, X } from 'lucide-react';
import { CampusLogo } from '@/components/brand';
import { cn } from '@/lib/utils';
import s from './landing.module.css';

const LINKS = [
  { href: '#product', label: 'Product' },
  { href: '#how', label: 'How it works' },
  { href: '#colleges', label: 'For colleges' },
];

export function LandingNav() {
  const [scrolled, setScrolled] = React.useState(false);
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <header className="fixed inset-x-0 top-0 z-50 px-3 pt-3 sm:px-5">
      <nav
        aria-label="Main"
        className={cn(
          s.nav,
          'mx-auto flex max-w-[1240px] items-center gap-4 rounded-2xl px-3 sm:px-4',
          scrolled || open ? cn(s.navScrolled, 'py-2') : 'py-3',
        )}
      >
        <Link href="/" className={cn(s.focusRing, 'shrink-0 rounded-lg')} aria-label="CampusOS home">
          <CampusLogo size="sm" theme="dark" decorative />
        </Link>

        <ul className="ml-6 hidden items-center gap-1 lg:flex">
          {LINKS.map((l) => (
            <li key={l.href}>
              <a
                href={l.href}
                className={cn(s.focusRing, 'rounded-lg px-3 py-2 text-[13.5px] font-semibold text-[#e9e4ff]/80 transition-colors hover:text-white')}
              >
                {l.label}
              </a>
            </li>
          ))}
        </ul>

        <div className="ml-auto hidden items-center gap-2 lg:flex">
          <Link
            href="/login"
            className={cn(s.focusRing, 'rounded-xl px-3.5 py-2 text-[13.5px] font-bold text-white/90 hover:text-white')}
          >
            Sign in
          </Link>
          <Link
            href="/register"
            className={cn(
              s.focusRing,
              'inline-flex items-center gap-1.5 rounded-xl border-[1.5px] border-[var(--lp-ink)] bg-[var(--lp-yellow)] px-4 py-2 text-[13.5px] font-extrabold text-[var(--lp-ink)] shadow-[2px_2px_0_0_#0b0920] transition-transform hover:-translate-y-0.5',
            )}
          >
            Create student account <ArrowRight size={15} aria-hidden />
          </Link>
        </div>

        <button
          type="button"
          className={cn(s.focusRing, 'ml-auto rounded-lg p-2 text-white lg:hidden')}
          aria-expanded={open}
          aria-controls="lp-mobile-menu"
          aria-label={open ? 'Close menu' : 'Open menu'}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <X size={22} /> : <Menu size={22} />}
        </button>
      </nav>

      {open ? (
        <div
          id="lp-mobile-menu"
          className="mx-auto mt-2 max-w-[1240px] rounded-2xl border border-[var(--lp-lav)]/25 bg-[var(--lp-night)] p-3 shadow-xl lg:hidden"
        >
          <ul className="grid gap-1">
            {LINKS.map((l) => (
              <li key={l.href}>
                <a
                  href={l.href}
                  onClick={() => setOpen(false)}
                  className={cn(s.focusRing, 'block rounded-xl px-3 py-3 text-[15px] font-semibold text-white/90 hover:bg-white/5')}
                >
                  {l.label}
                </a>
              </li>
            ))}
          </ul>
          <div className="mt-2 grid gap-2 border-t border-white/10 pt-3">
            <Link
              href="/register"
              className={cn(s.focusRing, 'flex items-center justify-center gap-1.5 rounded-xl border-[1.5px] border-[var(--lp-ink)] bg-[var(--lp-yellow)] px-4 py-3 text-[15px] font-extrabold text-[var(--lp-ink)]')}
            >
              Create student account <ArrowRight size={16} aria-hidden />
            </Link>
            <Link href="/login" className={cn(s.focusRing, 'rounded-xl px-4 py-3 text-center text-[15px] font-bold text-white')}>
              Sign in
            </Link>
          </div>
        </div>
      ) : null}
    </header>
  );
}
