import * as React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { ChevronRight, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PixelFlame, PixelAvatar, PixelRobot, type AvatarTone } from './pixel';

export * from './pixel';

/* ==========================================================================
   CampusOS component system
   --------------------------------------------------------------------------
   Server-compatible building blocks for the student experience. They encode
   the visual language once (ink outline + pop shadow, pastel tones, display
   type) so pages compose rather than re-style. See docs/CAMPUSOS_UI_SYSTEM.md.
   ========================================================================== */

export type Tone = 'mint' | 'coral' | 'lavender' | 'sun' | 'peach' | 'sky' | 'rose' | 'plain';

export const TONE_BG: Record<Tone, string> = {
  mint: 'bg-mint',
  coral: 'bg-coral',
  lavender: 'bg-lavender',
  sun: 'bg-sun',
  peach: 'bg-peach',
  sky: 'bg-sky',
  rose: 'bg-rose',
  plain: 'bg-surface-raised',
};
export const TONE_INK: Record<Tone, string> = {
  mint: 'text-mint-ink',
  coral: 'text-coral-ink',
  lavender: 'text-lavender-ink',
  sun: 'text-sun-ink',
  peach: 'text-peach-ink',
  sky: 'text-sky-ink',
  rose: 'text-rose-ink',
  plain: 'text-default',
};
const TONE_FILL: Record<Tone, string> = {
  mint: 'bg-mint-ink',
  coral: 'bg-coral-ink',
  lavender: 'bg-brand',
  sun: 'bg-sun-ink',
  peach: 'bg-peach-ink',
  sky: 'bg-sky-ink',
  rose: 'bg-rose-ink',
  plain: 'bg-brand',
};

/* --------------------------------- Card ---------------------------------- */

export function CampusCard({
  tone = 'plain',
  className,
  children,
  as: Comp = 'div',
  ...props
}: {
  tone?: Tone;
  className?: string;
  children: React.ReactNode;
  as?: 'div' | 'section' | 'article' | 'aside';
} & React.HTMLAttributes<HTMLElement>) {
  return (
    <Comp className={cn('rounded-2xl campus-outline', TONE_BG[tone], className)} {...props}>
      {children}
    </Comp>
  );
}

/** Title row inside a card or section: bold title, optional "View All". */
export function CampusSectionHeader({
  title,
  href,
  linkLabel = 'View All',
  action,
  id,
  className,
}: {
  title: React.ReactNode;
  href?: string;
  linkLabel?: string;
  action?: React.ReactNode;
  id?: string;
  className?: string;
}) {
  return (
    <div className={cn('flex items-center justify-between gap-3', className)}>
      <h2 id={id} className="font-display text-[17px] font-extrabold text-default">
        {title}
      </h2>
      {action ??
        (href ? (
          <Link href={href} className="text-[12.5px] font-bold text-brand hover:underline">
            {linkLabel}
          </Link>
        ) : null)}
    </div>
  );
}

/* --------------------------------- Pills --------------------------------- */

export function CampusPill({
  tone = 'lavender',
  children,
  className,
}: {
  tone?: Tone;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md px-2 py-0.5 text-[11.5px] font-bold leading-5',
        TONE_BG[tone],
        TONE_INK[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Deterministic, meaningful tone for a tag/category name. */
export function toneForTag(tag: string): Tone {
  const t = tag.toLowerCase();
  if (/hack|tech|coding|ai|workshop/.test(t)) return 'lavender';
  if (/cultur|music|fest|dance/.test(t)) return 'rose';
  if (/finance|compet|case|quiz/.test(t)) return 'coral';
  if (/career|placement|intern|job/.test(t)) return 'peach';
  if (/sport|football|cricket/.test(t)) return 'mint';
  if (/seminar|talk|lecture|academic/.test(t)) return 'sky';
  if (/startup|entrepreneur|pitch/.test(t)) return 'sun';
  return 'lavender';
}

/* ------------------------------- Icon tile ------------------------------- */

export function CampusIconTile({
  icon: Icon,
  tone = 'lavender',
  size = 'md',
  className,
}: {
  icon: LucideIcon;
  tone?: Tone;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const dims = { sm: 'h-7 w-7', md: 'h-9 w-9', lg: 'h-11 w-11' }[size];
  const icon = { sm: 14, md: 17, lg: 20 }[size];
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-lg border-[1.5px] border-ink',
        TONE_BG[tone],
        TONE_INK[tone],
        dims,
        className,
      )}
      aria-hidden
    >
      <Icon size={icon} strokeWidth={2.25} />
    </span>
  );
}

/* ------------------------------- Progress -------------------------------- */

export function CampusProgressBar({
  value,
  tone = 'lavender',
  label,
  className,
}: {
  /** 0–100 */
  value: number;
  tone?: Tone;
  label: string;
  className?: string;
}) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div
      className={cn('h-2.5 w-full overflow-hidden rounded-full bg-surface-sunken', className)}
      role="progressbar"
      aria-label={label}
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div className={cn('h-full rounded-full', TONE_FILL[tone])} style={{ width: `${pct}%` }} />
    </div>
  );
}

/**
 * One row of "My Progress". `value` null means there is no data yet — the
 * row says so instead of drawing a fake bar.
 */
export function CampusProgressRow({
  icon,
  label,
  value,
  tone,
  href,
  emptyText = 'No data yet',
  detail,
}: {
  icon: LucideIcon;
  label: string;
  value: number | null;
  tone: Tone;
  href?: string;
  emptyText?: string;
  detail?: string;
}) {
  const body = (
    <div className="flex items-center gap-3">
      <CampusIconTile icon={icon} tone={tone} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[13px] font-bold text-default">{label}</span>
          <span className={cn('tabular text-[13px] font-extrabold', value === null ? 'text-subtle' : TONE_INK[tone])}>
            {value === null ? '—' : `${Math.round(value)}%`}
          </span>
        </div>
        {value === null ? (
          <p className="mt-1 text-[11.5px] text-subtle">{emptyText}</p>
        ) : (
          <CampusProgressBar value={value} tone={tone} label={`${label} ${Math.round(value)}%`} className="mt-1.5 h-2" />
        )}
        {detail && value !== null ? <p className="mt-1 text-[11.5px] text-subtle">{detail}</p> : null}
      </div>
    </div>
  );
  return href ? (
    <Link href={href} className="block rounded-lg p-1 -m-1 hover:bg-surface-sunken/60">
      {body}
    </Link>
  ) : (
    body
  );
}

/** Level + XP bar. Only render when gamification is enabled and real XP exists. */
export function CampusXPBar({
  level,
  xpIntoLevel,
  xpForLevel,
  compact = false,
  avatarTone,
}: {
  level: number;
  xpIntoLevel: number;
  xpForLevel: number;
  compact?: boolean;
  avatarTone?: AvatarTone;
}) {
  return (
    <div className="flex items-center gap-2.5">
      {avatarTone ? <PixelAvatar tone={avatarTone} size={compact ? 28 : 36} /> : null}
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between">
          <span className={cn('font-display font-extrabold text-default', compact ? 'text-[13px]' : 'text-[16px]')}>
            Lv {level}
          </span>
          <span className="tabular text-[11px] font-semibold text-subtle">
            {xpIntoLevel} / {xpForLevel} XP
          </span>
        </div>
        <CampusProgressBar value={(xpIntoLevel / Math.max(1, xpForLevel)) * 100} tone="lavender" label={`Level ${level} progress`} className="mt-1 h-2" />
      </div>
    </div>
  );
}

/** Streak with the week's dots. Encouraging copy — never shaming. */
export function CampusStreak({
  days,
  week,
  label = 'Streak',
}: {
  days: number;
  /** Mon..Sun: true = done, false = missed/not yet */
  week?: boolean[];
  label?: string;
}) {
  const names = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  return (
    <div className="flex items-center gap-3">
      <PixelFlame size={30} dim={days === 0} />
      <div className="min-w-0 flex-1">
        <p className="font-display text-[16px] font-extrabold text-default">
          {days} day {label.toLowerCase()}
        </p>
        <p className="text-[12px] text-muted">
          {days === 0 ? 'Start today — one small step counts.' : 'Keep going! One missed day doesn’t erase your progress.'}
        </p>
        {week ? (
          <ol className="mt-2 flex gap-2" aria-label="This week">
            {week.map((done, i) => (
              <li key={i} className="flex flex-col items-center gap-0.5">
                <span
                  className={cn(
                    'h-3 w-3 rounded-full border-[1.5px] border-ink',
                    done ? 'bg-peach-ink' : 'bg-surface-sunken',
                  )}
                  aria-label={`${names[i]}: ${done ? 'done' : 'not done'}`}
                />
                <span className="text-[9.5px] font-semibold text-subtle" aria-hidden>
                  {names[i]}
                </span>
              </li>
            ))}
          </ol>
        ) : null}
      </div>
    </div>
  );
}

/* -------------------------------- Timeline -------------------------------- */

export interface TimelineItem {
  key: string;
  start: string;
  end?: string | null;
  title: string;
  meta?: string | null;
  status?: 'ongoing' | 'next' | 'done' | 'cancelled' | 'upcoming';
  note?: string | null;
  href?: string;
}

export function CampusTimeline({ items }: { items: TimelineItem[] }) {
  return (
    <ol className="relative space-y-2.5">
      {items.map((item, i) => {
        const ongoing = item.status === 'ongoing';
        const cancelled = item.status === 'cancelled';
        const Wrapper = item.href ? Link : 'div';
        return (
          <li key={item.key} className="flex gap-2.5">
            <div className="flex w-[46px] shrink-0 flex-col pt-2 text-right">
              <span className="tabular text-[12.5px] font-extrabold text-default">{item.start}</span>
              {item.end ? <span className="tabular text-[11px] text-subtle">{item.end}</span> : null}
            </div>
            <div className="relative flex w-3 shrink-0 justify-center" aria-hidden>
              <span className={cn('mt-3 h-2.5 w-2.5 rounded-full border-[1.5px] border-ink', ongoing ? 'bg-mint-ink' : 'bg-surface-raised')} />
              {i < items.length - 1 ? <span className="absolute bottom-[-12px] top-[26px] w-px bg-[hsl(var(--border-strong))]" /> : null}
            </div>
            <Wrapper
              href={item.href as string}
              className={cn(
                'min-w-0 flex-1 rounded-xl border-[1.5px] px-3 py-2',
                ongoing
                  ? 'border-ink bg-mint shadow-pop'
                  : cancelled
                    ? 'border-dashed border-[hsl(var(--border-strong))] bg-surface-sunken opacity-80'
                    : 'border-[hsl(var(--border-strong))] bg-surface-raised',
                item.href && 'transition-colors hover:border-ink',
              )}
            >
              <p className={cn('truncate text-[13.5px] font-bold text-default', cancelled && 'line-through')}>{item.title}</p>
              <p className="flex flex-wrap items-center gap-x-2 text-[12px] text-muted">
                {item.meta ? <span>{item.meta}</span> : null}
                {ongoing ? <span className="font-bold text-mint-ink">★ Ongoing</span> : null}
                {item.status === 'next' ? <span className="font-bold text-brand">Up next</span> : null}
                {item.note ? <span className="font-semibold text-coral-ink">{item.note}</span> : null}
              </p>
            </Wrapper>
          </li>
        );
      })}
    </ol>
  );
}

/* ----------------------------- Quick actions ----------------------------- */

export function CampusQuickAction({
  href,
  icon,
  label,
  tone,
}: {
  href: string;
  icon: LucideIcon;
  label: string;
  tone: Tone;
}) {
  return (
    <Link
      href={href}
      className={cn(
        'campus-outline campus-press flex min-h-[56px] items-center gap-2.5 rounded-xl px-3 py-2.5',
        TONE_BG[tone],
      )}
    >
      <CampusIconTile icon={icon} tone={tone} size="md" className="bg-surface-raised" />
      <span className="text-[13px] font-bold leading-tight text-default">{label}</span>
    </Link>
  );
}

/* -------------------------------- Notices -------------------------------- */

export function CampusNotice({
  icon,
  tone,
  title,
  meta,
  href,
  unread = false,
}: {
  icon: LucideIcon;
  tone: Tone;
  title: string;
  meta: string;
  href?: string;
  unread?: boolean;
}) {
  const body = (
    <>
      <CampusIconTile icon={icon} tone={tone} size="sm" className="mt-0.5" />
      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 text-[13px] font-bold leading-snug text-default">
          {unread ? <span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-brand align-middle" aria-label="Unread" /> : null}
          {title}
        </p>
        <p className="mt-0.5 truncate text-[11.5px] text-muted">{meta}</p>
      </div>
    </>
  );
  return href ? (
    <Link href={href} className="-mx-2 flex gap-2.5 rounded-lg px-2 py-2 hover:bg-surface-sunken/70">
      {body}
    </Link>
  ) : (
    <div className="flex gap-2.5 py-2">{body}</div>
  );
}

/* ------------------------------ Illustration ----------------------------- */

export const ILLUSTRATIONS = {
  'home-hero': { src: '/illustrations/home-hero.webp', w: 636, h: 414 },
  'events-hero': { src: '/illustrations/events-hero.webp', w: 1106, h: 280 },
  'library-hero': { src: '/illustrations/library-hero.webp', w: 644, h: 220 },
  'career-hero': { src: '/illustrations/career-hero.webp', w: 436, h: 224 },
  'empty-goals': { src: '/illustrations/empty-goals.webp', w: 204, h: 154 },
  'empty-library': { src: '/illustrations/empty-library.webp', w: 244, h: 112 },
  'campus-footer': { src: '/illustrations/campus-footer.webp', w: 318, h: 252 },
} as const;
export type IllustrationName = keyof typeof ILLUSTRATIONS;

/** Decorative scene art. Pass `alt` only when the image carries meaning. */
export function CampusIllustration({
  name,
  alt = '',
  className,
  priority = false,
  sizes = '(min-width: 1024px) 480px, 100vw',
}: {
  name: IllustrationName;
  alt?: string;
  className?: string;
  priority?: boolean;
  sizes?: string;
}) {
  const img = ILLUSTRATIONS[name];
  return (
    <Image
      src={img.src}
      alt={alt}
      width={img.w}
      height={img.h}
      priority={priority}
      sizes={sizes}
      className={cn('h-auto w-full select-none', className)}
      draggable={false}
    />
  );
}

/* ------------------------------ Empty state ------------------------------ */

export function CampusEmptyState({
  illustration,
  sprite,
  title,
  description,
  action,
  className,
}: {
  illustration?: IllustrationName;
  sprite?: 'robot' | 'student';
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center px-4 py-8 text-center', className)}>
      {illustration ? (
        <CampusIllustration name={illustration} className="mb-3 max-w-[180px] rounded-lg" sizes="180px" />
      ) : sprite === 'robot' ? (
        <PixelRobot size={56} className="mb-3" />
      ) : sprite === 'student' ? (
        <PixelAvatar size={52} className="mb-3" />
      ) : null}
      <p className="font-display text-[15px] font-extrabold text-default">{title}</p>
      {description ? <p className="mt-1 max-w-xs text-[13px] leading-relaxed text-muted">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

/* ---------------------------- Speech bubble ------------------------------ */

/** Pixel-font speech bubble used next to the avatar/mascot. Short, human copy only. */
export function CampusSpeech({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'relative rounded-xl border-[1.5px] border-ink bg-surface-raised px-3 py-1.5 font-pixel text-[13px] leading-snug text-default shadow-pop',
        'before:absolute before:-left-[7px] before:top-1/2 before:h-3 before:w-3 before:-translate-y-1/2 before:rotate-45 before:border-b-[1.5px] before:border-l-[1.5px] before:border-ink before:bg-surface-raised',
        className,
      )}
    >
      {children}
    </div>
  );
}

/* --------------------------------- Tabs ---------------------------------- */

/** Link-based segmented tabs (server-rendered, URL is the state). */
export function CampusTabs({
  tabs,
  active,
  label,
  className,
}: {
  tabs: { key: string; label: string; href: string; count?: number }[];
  active: string;
  label: string;
  className?: string;
}) {
  return (
    <nav aria-label={label} className={cn('-mx-1 overflow-x-auto px-1 scrollbar-none', className)}>
      <ul className="flex w-max gap-2 py-1">
        {tabs.map((t) => {
          const on = t.key === active;
          return (
            <li key={t.key}>
              <Link
                href={t.href}
                aria-current={on ? 'page' : undefined}
                className={cn(
                  'inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border-[1.5px] px-3.5 text-[13px] font-bold transition-colors',
                  on
                    ? 'border-ink bg-brand text-white shadow-pop'
                    : 'border-[hsl(var(--border-strong))] bg-surface-raised text-muted hover:border-ink hover:text-default',
                )}
              >
                {t.label}
                {t.count !== undefined ? <span className={cn('tabular text-[11px]', on ? 'text-white/80' : 'text-subtle')}>{t.count}</span> : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/* ---------------------------- "See more" link ----------------------------- */

export function CampusLinkRow({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="flex items-center justify-between rounded-lg px-2 py-2 text-[13px] font-semibold text-default hover:bg-surface-sunken">
      {children}
      <ChevronRight size={15} className="text-subtle" aria-hidden />
    </Link>
  );
}
