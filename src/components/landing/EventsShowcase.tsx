'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowRight, CalendarDays, MapPin } from 'lucide-react';
import { cn } from '@/lib/utils';
import s from './landing.module.css';

type Kind = 'Events' | 'Workshops' | 'Competitions' | 'Internships';
const TABS: ('All' | Kind)[] = ['All', 'Events', 'Workshops', 'Competitions', 'Internships'];

const ITEMS: { kind: Kind; tag: string; title: string; when: string; where: string; cta: string; from: string; to: string; glyph: string }[] = [
  { kind: 'Competitions', tag: 'Hackathon', title: 'Build-for-Campus Hackathon', when: '24 hours · Sat–Sun', where: 'Main auditorium', cta: 'View details', from: '#4c1d95', to: '#1e1b4b', glyph: '</>' },
  { kind: 'Workshops', tag: 'Workshop', title: 'Data Analytics with Spreadsheets', when: 'Tue · 2:00 PM', where: 'Seminar hall', cta: 'View details', from: '#0e7490', to: '#1e3a8a', glyph: '▤' },
  { kind: 'Events', tag: 'Cultural fest', title: 'Annual Cultural Fest', when: '3 days · next month', where: 'Open to all colleges', cta: 'View details', from: '#be185d', to: '#7c2d12', glyph: '♪' },
  { kind: 'Internships', tag: 'Internship', title: 'Finance Research Internship', when: 'Apply by the 20th', where: 'Remote', cta: 'Track it', from: '#15803d', to: '#1e3a8a', glyph: '₹' },
];

export function EventsShowcase() {
  const [tab, setTab] = React.useState<(typeof TABS)[number]>('All');
  const items = tab === 'All' ? ITEMS : ITEMS.filter((i) => i.kind === tab);

  return (
    <section className="bg-[var(--lp-cream)] px-5 py-24 sm:px-8 lg:py-28" aria-labelledby="lp-events">
      <div className="mx-auto max-w-[1240px]">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className={cn(s.pixelText, 'text-[13px] uppercase text-[#db2777]')}>Events & opportunities</p>
            <h2 id="lp-events" className={cn(s.display, 'mt-4 max-w-[640px] text-[clamp(36px,4.6vw,56px)]')}>
              Never miss what&apos;s happening on campus.
            </h2>
          </div>
          <div role="group" aria-label="Filter examples" className={cn(s.scroller, '-mx-5 flex gap-2 overflow-x-auto px-5 pb-1 lg:mx-0 lg:px-0')}>
            {TABS.map((t) => (
              <button
                key={t}
                type="button"
                aria-pressed={tab === t}
                onClick={() => setTab(t)}
                className={cn(
                  s.focusRing,
                  'shrink-0 rounded-full border-[1.5px] px-4 py-2 text-[13.5px] font-bold transition-colors',
                  tab === t
                    ? 'border-[var(--lp-ink)] bg-[var(--lp-ink)] text-white'
                    : 'border-[var(--lp-ink)]/20 bg-white/60 text-[var(--lp-ink)] hover:border-[var(--lp-ink)]',
                )}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        <ul className={cn(s.scroller, '-mx-5 mt-10 flex gap-4 overflow-x-auto px-5 pb-4 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 lg:grid-cols-4')}>
          {items.map((e) => (
            <li key={e.title} className="w-[78%] shrink-0 sm:w-auto">
              <Link href="/register" className={cn(s.card, s.lift, s.focusRing, 'group flex h-full flex-col overflow-hidden p-0')}>
                <div className="relative h-[132px] overflow-hidden border-b-[1.5px] border-[var(--lp-ink)]">
                  <div className={cn(s.zoom, 'absolute inset-0')} style={{ background: `linear-gradient(135deg, ${e.from}, ${e.to})` }} aria-hidden>
                    <div className={cn(s.stars, 'absolute inset-0 opacity-70')} />
                    <span className={cn(s.pixelText, 'absolute bottom-2 right-3 text-[56px] leading-none text-white/25')}>{e.glyph}</span>
                  </div>
                  <span className="absolute left-3 top-3 rounded-md border-[1.5px] border-[var(--lp-ink)] bg-[var(--lp-yellow)] px-2 py-0.5 text-[11px] font-extrabold uppercase tracking-wide text-[var(--lp-ink)]">
                    {e.tag}
                  </span>
                </div>
                <div className="flex flex-1 flex-col p-4">
                  <h3 className="text-[16px] font-extrabold leading-snug tracking-tight">{e.title}</h3>
                  <p className="mt-2 flex items-center gap-1.5 text-[12.5px] text-[var(--lp-muted)]">
                    <CalendarDays size={13} aria-hidden /> {e.when}
                  </p>
                  <p className="mt-1 flex items-center gap-1.5 text-[12.5px] text-[var(--lp-muted)]">
                    <MapPin size={13} aria-hidden /> {e.where}
                  </p>
                  <span className="mt-auto inline-flex items-center gap-1.5 pt-4 text-[13px] font-extrabold text-[var(--lp-ink)]">
                    {e.cta} <ArrowRight size={14} className={s.arrow} aria-hidden />
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-[12px] text-[var(--lp-muted)]">Sample listings. Sign in to see what&apos;s on at your college.</p>
      </div>
    </section>
  );
}
