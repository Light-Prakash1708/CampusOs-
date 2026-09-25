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

/* ==========================================================================
   Phase 1 additions — ring, stat, search, filter, level chip, coming-soon.
   All server-compatible. Interactive overlays and the slider live in
   ./overlays (client). See docs/CAMPUSOS_UI_SYSTEM.md.
   ========================================================================== */

/** Ring stroke colours by tone (SVG needs a colour, not a class). */
const RING_STROKE: Record<Tone, string> = {
  mint: 'hsl(var(--tone-mint-ink))',
  coral: 'hsl(var(--tone-coral-ink))',
  lavender: 'hsl(var(--brand))',
  sun: 'hsl(var(--tone-sun-ink))',
  peach: 'hsl(var(--tone-peach-ink))',
  sky: 'hsl(var(--tone-sky-ink))',
  rose: 'hsl(var(--tone-rose-ink))',
  plain: 'hsl(var(--brand))',
};

/**
 * Donut ring (attendance, completion). `value` null draws an empty track and
 * the `emptyLabel` — never a made-up number. Optional `marker` draws a tick at
 * a threshold (e.g. the 75% attendance line).
 */
export function CampusRing({
  value,
  label,
  sublabel,
  tone = 'mint',
  size = 132,
  thickness = 14,
  marker,
  emptyLabel = 'No data yet',
  className,
}: {
  /** 0–100, or null when there is no data. */
  value: number | null;
  label: string;
  sublabel?: string;
  tone?: Tone;
  size?: number;
  thickness?: number;
  /** 0–100 threshold tick. */
  marker?: number;
  emptyLabel?: string;
  className?: string;
}) {
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  const pct = value === null ? 0 : Math.max(0, Math.min(100, value));
  const markerAngle = marker === undefined ? null : (Math.max(0, Math.min(100, marker)) / 100) * 2 * Math.PI - Math.PI / 2;
  const text = value === null ? emptyLabel : `${label}: ${Number.isInteger(pct) ? pct : pct.toFixed(1)}%${sublabel ? `, ${sublabel}` : ''}`;
  return (
    <div className={cn('relative inline-flex shrink-0 items-center justify-center', className)} style={{ width: size, height: size }} role="img" aria-label={text}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="hsl(var(--surface-sunken))" strokeWidth={thickness} />
        <circle cx={size / 2} cy={size / 2} r={r + thickness / 2} fill="none" stroke="hsl(var(--ink))" strokeWidth={1.5} opacity={0.9} />
        <circle cx={size / 2} cy={size / 2} r={r - thickness / 2} fill="none" stroke="hsl(var(--ink))" strokeWidth={1.5} opacity={0.9} />
        {value !== null ? (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={RING_STROKE[tone]}
            strokeWidth={thickness - 3}
            strokeDasharray={`${(pct / 100) * c} ${c}`}
            strokeLinecap="butt"
          />
        ) : null}
      </svg>
      {markerAngle !== null ? (
        <span
          aria-hidden
          className="absolute h-[18px] w-[3px] rounded-full bg-ink"
          style={{
            left: size / 2 + r * Math.cos(markerAngle) - 1.5,
            top: size / 2 + r * Math.sin(markerAngle) - 9,
            transform: `rotate(${markerAngle + Math.PI / 2}rad)`,
          }}
        />
      ) : null}
      <span className="absolute inset-0 flex flex-col items-center justify-center text-center" aria-hidden>
        {value === null ? (
          <span className="px-4 text-[11.5px] font-semibold leading-tight text-subtle">{emptyLabel}</span>
        ) : (
          <>
            {/* Small rings show whole percent so the figure always fits inside. */}
            <span className="tabular font-display font-extrabold leading-none text-default" style={{ fontSize: Math.max(13, size / 5.2) }}>
              {size < 90 || Number.isInteger(pct) ? Math.round(pct) : pct.toFixed(1)}%
            </span>
            {sublabel ? <span className="mt-1 px-3 text-[10.5px] font-semibold leading-tight text-subtle">{sublabel}</span> : null}
          </>
        )}
      </span>
    </div>
  );
}

/** Compact number tile ("48 · Total classes"). `value` null shows "—". */
export function CampusStat({
  label,
  value,
  hint,
  tone = 'plain',
  href,
  className,
}: {
  label: string;
  value: React.ReactNode | null;
  hint?: string;
  tone?: Tone;
  href?: string;
  className?: string;
}) {
  const body = (
    <>
      <span className="flex items-center gap-1.5 text-[12px] font-semibold text-muted">
        {tone !== 'plain' ? <span className={cn('h-2.5 w-2.5 rounded-full border border-ink', TONE_BG[tone])} aria-hidden /> : null}
        {label}
      </span>
      <span className="tabular mt-0.5 block font-display text-[24px] font-extrabold leading-tight text-default">{value ?? '—'}</span>
      {hint ? <span className="block text-[11.5px] text-subtle">{hint}</span> : null}
    </>
  );
  const cls = cn('block rounded-2xl border-[1.5px] border-ink bg-surface-raised p-3.5 shadow-pop', href && 'campus-press', className);
  return href ? (
    <Link href={href} className={cls}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

/**
 * Search box. A plain GET form, so it works without JavaScript, keeps the
 * query in the URL (shareable, back-button friendly) and preserves the other
 * filters via hidden fields.
 */
export function CampusSearch({
  action,
  name = 'q',
  defaultValue,
  placeholder,
  label,
  hidden,
  className,
}: {
  action: string;
  name?: string;
  defaultValue?: string;
  placeholder: string;
  /** Accessible name for the field. */
  label: string;
  hidden?: Record<string, string | undefined>;
  className?: string;
}) {
  return (
    <form action={action} method="get" role="search" className={cn('flex gap-2', className)}>
      {Object.entries(hidden ?? {}).map(([k, v]) => (v ? <input key={k} type="hidden" name={k} value={v} /> : null))}
      <label className="relative flex-1">
        <span className="sr-only">{label}</span>
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-subtle" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
        <input
          type="search"
          name={name}
          defaultValue={defaultValue}
          placeholder={placeholder}
          className="h-11 w-full rounded-xl border-[1.5px] border-[hsl(var(--border-strong))] bg-surface pl-9 pr-3 text-[14px] text-default placeholder:text-subtle focus:border-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
        />
      </label>
      <button type="submit" className="h-11 rounded-xl border-[1.5px] border-ink bg-brand px-4 text-[13.5px] font-bold text-white shadow-pop campus-press">
        Search
      </button>
    </form>
  );
}

/**
 * Filter chips. Link-based: each chip is a URL, so filters are shareable and
 * server-rendered. Scrolls horizontally on phones instead of wrapping into a
 * wall of pills.
 */
export function CampusFilter({
  label,
  options,
  className,
}: {
  label: string;
  options: { key: string; label: string; href: string; active: boolean; count?: number }[];
  className?: string;
}) {
  return (
    <nav aria-label={label} className={cn('-mx-1 overflow-x-auto px-1 scrollbar-none', className)}>
      <ul className="flex w-max gap-2 py-1">
        {options.map((o) => (
          <li key={o.key}>
            <Link
              href={o.href}
              aria-current={o.active ? 'true' : undefined}
              scroll={false}
              className={cn(
                'inline-flex min-h-[36px] items-center gap-1.5 rounded-full border-[1.5px] px-3.5 text-[12.5px] font-bold transition-colors',
                o.active ? 'border-ink bg-brand text-white shadow-pop' : 'border-[hsl(var(--border-strong))] bg-surface text-muted hover:border-ink hover:text-default',
              )}
            >
              {o.label}
              {o.count !== undefined ? <span className={cn('tabular text-[11px]', o.active ? 'text-white/80' : 'text-subtle')}>{o.count}</span> : null}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** "Coming in Phase 5" — the only acceptable stand-in for an unbuilt feature. */
export function CampusComingSoon({ label, className }: { label: string; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-md border border-dashed border-[hsl(var(--border-strong))] bg-surface px-2 py-0.5 text-[11px] font-bold text-subtle', className)}>
      <svg viewBox="0 0 12 12" width="10" height="10" aria-hidden fill="currentColor"><rect x="5" y="2" width="2" height="5" /><rect x="5" y="5" width="4" height="2" /><rect x="1" y="1" width="10" height="1" /><rect x="1" y="10" width="10" height="1" /><rect x="1" y="1" width="1" height="10" /><rect x="10" y="1" width="1" height="10" /></svg>
      {label}
    </span>
  );
}

/**
 * Level / XP chip for the user card. Renders real XP when the gamification
 * engine supplies it; until then it shows the planned state honestly — no
 * invented level, no fake progress.
 */
export function CampusLevelChip({
  level,
  xpIntoLevel,
  xpForLevel,
  plannedLabel,
  className,
}: {
  level: number | null;
  xpIntoLevel?: number;
  xpForLevel?: number;
  /** Shown when `level` is null, e.g. "Coming in Phase 7". */
  plannedLabel?: string;
  className?: string;
}) {
  if (level === null) {
    return (
      <span className={cn('flex items-center gap-2', className)} title={plannedLabel ? `Levels & XP: ${plannedLabel}` : undefined}>
        <span className="font-display text-[12px] font-extrabold text-subtle">Lv –</span>
        <span className="h-1.5 flex-1 rounded-full border border-dashed border-[hsl(var(--border-strong))]" aria-hidden />
        <span className="text-[10px] font-bold text-subtle">
          <span className="sr-only">Levels and XP: </span>
          {plannedLabel ? plannedLabel.replace('Coming in ', '') : 'Soon'}
        </span>
      </span>
    );
  }
  const pct = ((xpIntoLevel ?? 0) / Math.max(1, xpForLevel ?? 1)) * 100;
  return (
    <span className={cn('flex items-center gap-2', className)}>
      <span className="font-display text-[12px] font-extrabold text-default">Lv {level}</span>
      {/* spans, not CampusProgressBar's div: this chip sits inside a <button>. */}
      <span
        className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-sunken"
        role="progressbar"
        aria-label={`Level ${level}: ${xpIntoLevel} of ${xpForLevel} XP`}
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <span className="block h-full rounded-full bg-brand" style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
      </span>
      <span className="tabular text-[10px] font-bold text-subtle">
        {xpIntoLevel}/{xpForLevel}
      </span>
    </span>
  );
}
