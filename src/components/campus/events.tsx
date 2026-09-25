import * as React from 'react';
import Link from 'next/link';
import { BadgeCheck, CalendarDays, Globe2, MapPin, ShieldQuestion } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CampusPill, toneForTag, type Tone } from './index';

/* Event presentation shared by the dashboard, discovery and detail pages. */

const CATEGORY_TONE: Record<string, Tone> = {
  HACKATHON: 'lavender', WORKSHOP: 'sky', SEMINAR: 'sky', NETWORKING: 'sky', FEST: 'rose', CULTURAL: 'rose', OPEN_MIC: 'rose',
  COMPETITION: 'coral', CASE_COMPETITION: 'coral', DEBATE: 'coral', MUN: 'coral', SPORTS: 'mint', CAREER: 'peach',
  ENTREPRENEURSHIP: 'sun', CLUB: 'lavender', OTHER: 'lavender',
};
export const categoryTone = (c: string): Tone => CATEGORY_TONE[c] ?? 'lavender';

const ART_BG: Record<Tone, [string, string]> = {
  lavender: ['#2B2A6B', '#5B52DB'], rose: ['#5A1E3F', '#C8457E'], coral: ['#5B1F17', '#D9533E'], peach: ['#5C2D0D', '#E07B2E'],
  mint: ['#113D2B', '#2F9E6B'], sky: ['#10345E', '#2F7FD6'], sun: ['#5A4108', '#D69A12'], plain: ['#2B2A6B', '#5B52DB'],
};

/**
 * Generated pixel-skyline cover used until an organiser uploads one. Seeded by
 * the title so every event keeps the same art.
 */
export function EventCoverArt({ title, tone, className }: { title: string; tone: Tone; className?: string }) {
  let h = 2166136261;
  for (let i = 0; i < title.length; i++) h = Math.imul(h ^ title.charCodeAt(i), 16777619) >>> 0;
  const [sky, glow] = ART_BG[tone];
  const bars = Array.from({ length: 16 }, (_, i) => 5 + (((h >>> (i % 29)) + i * 7) % 9));
  return (
    <svg viewBox="0 0 64 28" className={cn('block w-full', className)} preserveAspectRatio="xMidYMid slice" shapeRendering="crispEdges" aria-hidden>
      <rect width="64" height="28" fill={sky} />
      <rect y="14" width="64" height="14" fill={glow} opacity="0.55" />
      {[3, 11, 20, 33, 47, 58].map((x, i) => (
        <rect key={i} x={x} y={2 + ((h >>> i) % 5)} width="1" height="1" fill="#FFF4C2" opacity="0.8" />
      ))}
      {bars.map((bh, i) => (
        <rect key={i} x={i * 4} y={28 - bh} width="3.4" height={bh} fill="#140F2E" opacity="0.9" />
      ))}
      {bars.map((bh, i) =>
        Array.from({ length: Math.floor(bh / 3) }, (_, j) =>
          ((h >>> ((i + j) % 31)) & 1) === 1 ? <rect key={`${i}-${j}`} x={i * 4 + 1} y={28 - bh + 1 + j * 3} width="1" height="1" fill="#FFD84A" /> : null,
        ),
      )}
    </svg>
  );
}

export function EventCover({ title, category, coverUrl, className }: { title: string; category: string; coverUrl: string | null; className?: string }) {
  if (coverUrl) {
    return <img src={coverUrl} alt="" className={cn('block w-full object-cover', className)} loading="lazy" />;
  }
  return <EventCoverArt title={title} tone={categoryTone(category)} className={className} />;
}

export function VerificationBadge({ verification, className }: { verification: string; className?: string }) {
  const verified = verification.startsWith('VERIFIED');
  const label =
    verification === 'VERIFIED_COLLEGE' ? 'Verified college'
      : verification === 'VERIFIED_CLUB' ? 'Verified club'
        : verification === 'VERIFIED_ORGANIZER' ? 'Verified organiser'
          : verification === 'COMMUNITY' ? 'Community submitted' : 'Pending verification';
  const Icon = verified ? BadgeCheck : ShieldQuestion;
  return (
    <span className={cn('inline-flex items-center gap-1 text-[11.5px] font-bold', verified ? 'text-mint-ink' : 'text-sun-ink', className)} title={label}>
      <Icon size={13} aria-hidden /> {label}
    </span>
  );
}

export function formatEventDates(start: Date, end: Date, timeZone = 'Asia/Kolkata'): string {
  const d = (x: Date, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en-IN', { timeZone, ...o }).format(x);
  const sameDay = d(start, { dateStyle: 'short' }) === d(end, { dateStyle: 'short' });
  if (sameDay) return `${d(start, { month: 'short', day: 'numeric' })} · ${d(start, { hour: 'numeric', minute: '2-digit' })}`;
  const sameMonth = d(start, { month: 'short' }) === d(end, { month: 'short' });
  return sameMonth
    ? `${d(start, { day: 'numeric' })}–${d(end, { day: 'numeric' })} ${d(start, { month: 'short' })}`
    : `${d(start, { month: 'short', day: 'numeric' })} – ${d(end, { month: 'short', day: 'numeric' })}`;
}

export interface EventCardData {
  id: string;
  title: string;
  category: string;
  organizerName: string;
  startsAt: Date;
  endsAt: Date;
  mode: string;
  city: string | null;
  area: string | null;
  venue: string | null;
  priceInr: number;
  certificateOffered: boolean;
  tags: string[];
  coverUrl: string | null;
  verification: string;
  distanceKm?: number | null;
  demo?: boolean;
}

/** Discovery card. `action` renders the register/notify control; `bookmark` the save toggle. */
export function CampusEventCard({
  event,
  href,
  action,
  bookmark,
  categoryLabel,
}: {
  event: EventCardData;
  href: string;
  action?: React.ReactNode;
  bookmark?: React.ReactNode;
  categoryLabel: string;
}) {
  const where = event.mode === 'ONLINE' ? 'Online' : [event.area ?? event.venue, event.city].filter(Boolean).join(' · ');
  return (
    <article className="flex h-full flex-col overflow-hidden rounded-2xl campus-outline bg-surface-raised">
      <div className="relative border-b-[1.5px] border-ink">
        <Link href={href} tabIndex={-1} aria-hidden>
          <EventCover title={event.title} category={event.category} coverUrl={event.coverUrl} className="aspect-[16/7]" />
        </Link>
        {bookmark ? <div className="absolute right-2 top-2">{bookmark}</div> : null}
        {event.demo ? (
          <span className="absolute left-2 top-2 rounded-md border border-ink bg-sun px-1.5 text-[10px] font-extrabold uppercase tracking-wide text-sun-ink">Demo</span>
        ) : null}
      </div>
      <div className="flex flex-1 flex-col p-3.5">
        <Link href={href} className="line-clamp-2 font-display text-[15px] font-extrabold leading-snug text-default hover:text-brand">
          {event.title}
        </Link>
        <p className="mt-0.5 truncate text-[12.5px] font-semibold text-muted">{event.organizerName}</p>
        <ul className="mt-2 space-y-0.5 text-[12px] text-muted">
          <li className="flex items-center gap-1.5">
            <CalendarDays size={12} aria-hidden /> {formatEventDates(event.startsAt, event.endsAt)}
          </li>
          <li className="flex items-center gap-1.5">
            {event.mode === 'ONLINE' ? <Globe2 size={12} aria-hidden /> : <MapPin size={12} aria-hidden />}
            <span className="truncate">
              {event.mode === 'HYBRID' ? 'Hybrid · ' : event.mode === 'OFFLINE' ? 'Offline · ' : ''}
              {where || 'Venue to be announced'}
              {event.distanceKm != null && event.distanceKm >= 0.5 ? ` · ${event.distanceKm} km` : ''}
            </span>
          </li>
        </ul>
        <div className="mt-2.5 flex flex-wrap gap-1">
          <CampusPill tone={categoryTone(event.category)}>{categoryLabel}</CampusPill>
          {event.tags.filter((tg) => tg.toLowerCase() !== categoryLabel.toLowerCase()).slice(0, 2).map((tg) => (
            <CampusPill key={tg} tone={toneForTag(tg)}>{tg}</CampusPill>
          ))}
          <CampusPill tone={event.priceInr === 0 ? 'mint' : 'sun'}>{event.priceInr === 0 ? 'Free' : `₹${event.priceInr}`}</CampusPill>
          {event.certificateOffered ? <CampusPill tone="sky">Certificate</CampusPill> : null}
        </div>
        {action ? <div className="mt-auto pt-3">{action}</div> : null}
      </div>
    </article>
  );
}
