import * as React from 'react';
import { cn } from '@/lib/utils';
import { detailFor, markRects, markSize, type MarkDetail } from './mark';

/**
 * CAMPUSOS LOGO
 * ---------------------------------------------------------------------------
 * One component for every place the brand appears.
 *
 *   variant  full        mark above the wordmark and tagline (sign-in, splash)
 *            horizontal  mark beside the wordmark (nav bars, sidebar)
 *            icon        mark only (compact headers, app tiles)
 *            wordmark    text only
 *   theme    auto (follows the app theme) | light | dark (forced, e.g. on an
 *            always-dark panel)
 *   size     sm · md · lg · xl
 *
 * The wordmark is live text in the display font (never an image). "Campus"
 * leads; the "OS" is set apart in lavender and green with an ink outline. The
 * tagline appears only on the full variant, or when `tagline` is set in a
 * large area.
 *
 * Accessibility: the logo is one image named "CampusOS". Pass `decorative`
 * when an adjacent label already names it (e.g. a link labelled "CampusOS
 * home"), so screen readers don't hear it twice.
 */

export type CampusLogoVariant = 'full' | 'horizontal' | 'icon' | 'wordmark';
export type CampusLogoTheme = 'auto' | 'light' | 'dark';
export type CampusLogoSize = 'sm' | 'md' | 'lg' | 'xl';

export const CAMPUS_TAGLINE = 'Your Campus. All in One.';

/** Mark height (px) and wordmark font size (px) per size step. */
const SCALE: Record<CampusLogoSize, { mark: number; text: number; stackedMark: number }> = {
  sm: { mark: 24, text: 17, stackedMark: 48 },
  md: { mark: 30, text: 20, stackedMark: 72 },
  lg: { mark: 36, text: 25, stackedMark: 96 },
  xl: { mark: 48, text: 40, stackedMark: 144 },
};

export function CampusMark({
  height = 30,
  detail,
  className,
  title,
}: {
  /** Rendered height in px; the width follows the mark's aspect ratio. */
  height?: number;
  /** Defaults to the simplified mark below 26px. */
  detail?: MarkDetail;
  className?: string;
  /** Accessible name; omit for a decorative mark. */
  title?: string;
}) {
  const d = detail ?? detailFor(height);
  const { width: vw, height: vh } = markSize(d);
  const width = Math.round((height * vw) / vh);
  return (
    <svg
      viewBox={`0 0 ${vw} ${vh}`}
      width={width}
      height={height}
      shapeRendering="crispEdges"
      className={cn('campus-mark shrink-0', className)}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      {markRects(d).map((r, i) => (
        <rect key={i} x={r.x} y={r.y} width={r.w} height={1} fill={r.fill} />
      ))}
    </svg>
  );
}

export function CampusWordmark({ fontSize, className }: { fontSize: number; className?: string }) {
  return (
    <span className={cn('campus-wordmark', className)} style={{ fontSize }} aria-hidden>
      Campus
      <span className="campus-wordmark-os">
        <span className="campus-wordmark-o">O</span>
        <span className="campus-wordmark-s">S</span>
      </span>
    </span>
  );
}

function Tagline({ fontSize, className }: { fontSize: number; className?: string }) {
  return (
    <span className={cn('campus-tagline', className)} style={{ fontSize }} aria-hidden>
      Your Campus. <span className="campus-tagline-accent">All in One.</span>
    </span>
  );
}

export function CampusLogo({
  variant = 'horizontal',
  theme = 'auto',
  size = 'md',
  tagline,
  decorative = false,
  className,
}: {
  variant?: CampusLogoVariant;
  theme?: CampusLogoTheme;
  size?: CampusLogoSize;
  /** Show "Your Campus. All in One." (default: only on the full variant). */
  tagline?: boolean;
  decorative?: boolean;
  className?: string;
}) {
  const s = SCALE[size];
  const showTagline = tagline ?? variant === 'full';
  const a11y = decorative ? { 'aria-hidden': true as const } : { role: 'img' as const, 'aria-label': 'CampusOS' };
  const themeAttr = theme === 'auto' ? undefined : theme;

  if (variant === 'icon') {
    return (
      <span className={cn('campus-logo inline-flex', className)} data-logo-theme={themeAttr} {...a11y}>
        <CampusMark height={s.mark} />
      </span>
    );
  }

  if (variant === 'wordmark') {
    return (
      <span className={cn('campus-logo inline-flex flex-col', className)} data-logo-theme={themeAttr} {...a11y}>
        <CampusWordmark fontSize={s.text} />
        {showTagline ? <Tagline fontSize={Math.round(s.text * 0.42)} className="mt-1" /> : null}
      </span>
    );
  }

  if (variant === 'full') {
    return (
      <span className={cn('campus-logo inline-flex flex-col items-center text-center', className)} data-logo-theme={themeAttr} {...a11y}>
        <CampusMark height={s.stackedMark} />
        <CampusWordmark fontSize={s.text} className="mt-2" />
        {showTagline ? <Tagline fontSize={Math.max(12, Math.round(s.text * 0.4))} className="mt-2" /> : null}
      </span>
    );
  }

  return (
    <span className={cn('campus-logo inline-flex items-center', size === 'sm' ? 'gap-1.5' : 'gap-2', className)} data-logo-theme={themeAttr} {...a11y}>
      <CampusMark height={s.mark} />
      <span className="flex flex-col">
        <CampusWordmark fontSize={s.text} />
        {showTagline ? <Tagline fontSize={Math.max(11, Math.round(s.text * 0.46))} className="mt-1" /> : null}
      </span>
    </span>
  );
}
