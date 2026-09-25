'use client';

import * as React from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

/* ==========================================================================
   CampusOS overlays: Modal, Drawer, BottomSheet — and Slider.
   --------------------------------------------------------------------------
   One accessible dialog core (useDialog) behind all three overlays:
     · rendered in a portal, role="dialog" + aria-modal + labelled by title
     · focus moves in on open, is trapped with Tab/Shift+Tab, returns to the
       trigger on close
     · Escape and backdrop click close; body scroll is locked while open
     · motion respects prefers-reduced-motion (animate-fade-up is disabled
       globally under reduced motion in globals.css)
   See docs/CAMPUSOS_UI_SYSTEM.md.
   ========================================================================== */

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

let openDialogs = 0;

function useDialog(open: boolean, onClose: () => void) {
  const panelRef = React.useRef<HTMLDivElement>(null);
  const onCloseRef = React.useRef(onClose);
  onCloseRef.current = onClose;

  React.useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    openDialogs += 1;
    document.body.style.overflow = 'hidden';

    const panel = panelRef.current;
    const first = panel?.querySelector<HTMLElement>('[data-autofocus]') ?? panel?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? panel)?.focus();

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab' || !panel) return;
      const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null);
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const firstEl = items[0]!;
      const lastEl = items[items.length - 1]!;
      if (e.shiftKey && document.activeElement === firstEl) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && document.activeElement === lastEl) {
        e.preventDefault();
        firstEl.focus();
      }
    }
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      openDialogs -= 1;
      if (openDialogs === 0) document.body.style.overflow = '';
      previouslyFocused?.focus?.();
    };
  }, [open]);

  return panelRef;
}

/**
 * True after hydration. Called unconditionally at the top of each overlay so
 * that when `open` flips, the portal renders in the SAME commit — the panel
 * ref exists before useDialog's effect runs and focus can move into it.
 */
function useMounted() {
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);
  return mounted;
}

function Portal({ children }: { children: React.ReactNode }) {
  return createPortal(children, document.body);
}

interface OverlayProps {
  open: boolean;
  onClose: () => void;
  title: string;
  /** Visually hide the title (it still labels the dialog). */
  hideTitle?: boolean;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}

function Header({ id, title, hideTitle, description, onClose }: { id: string; title: string; hideTitle?: boolean; description?: string; onClose: () => void }) {
  return (
    <div className="flex items-start gap-3">
      <div className={cn('min-w-0 flex-1', hideTitle && 'sr-only')}>
        <h2 id={id} className="font-display text-[18px] font-extrabold leading-tight text-default">
          {title}
        </h2>
        {description ? <p className="mt-0.5 text-[13px] text-muted">{description}</p> : null}
      </div>
      <button
        type="button"
        onClick={onClose}
        className="ml-auto -mr-1 -mt-1 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-muted hover:bg-surface-sunken hover:text-default"
        aria-label="Close"
      >
        <X size={18} aria-hidden />
      </button>
    </div>
  );
}

/** Centred dialog. Use for confirmations and short forms. */
export function CampusModal({ open, onClose, title, hideTitle, description, children, footer, className }: OverlayProps) {
  const ref = useDialog(open, onClose);
  const id = React.useId();
  const mounted = useMounted();
  if (!open || !mounted) return null;
  return (
    <Portal>
      <div className="fixed inset-0 z-[60] flex items-end justify-center p-0 sm:items-center sm:p-6">
        <div className="absolute inset-0 bg-ink/45" onClick={onClose} aria-hidden />
        <div
          ref={ref}
          role="dialog"
          aria-modal="true"
          aria-labelledby={id}
          tabIndex={-1}
          className={cn(
            'relative max-h-[90vh] w-full overflow-y-auto rounded-t-3xl border-[1.5px] border-ink bg-surface p-5 shadow-pop outline-none animate-fade-up sm:max-w-lg sm:rounded-3xl',
            className,
          )}
        >
          <Header id={id} title={title} hideTitle={hideTitle} description={description} onClose={onClose} />
          <div className="mt-4">{children}</div>
          {footer ? <div className="mt-5 flex flex-wrap justify-end gap-2">{footer}</div> : null}
        </div>
      </div>
    </Portal>
  );
}

/** Side panel. `side="left"` for navigation, `"right"` for details/filters. */
export function CampusDrawer({
  open,
  onClose,
  title,
  hideTitle,
  description,
  children,
  footer,
  className,
  side = 'right',
  bare = false,
}: OverlayProps & { side?: 'left' | 'right'; /** No padding/header: caller renders its own chrome (app nav). */ bare?: boolean }) {
  const ref = useDialog(open, onClose);
  const id = React.useId();
  const mounted = useMounted();
  if (!open || !mounted) return null;
  return (
    <Portal>
      <div className="fixed inset-0 z-[60]">
        <div className="absolute inset-0 bg-ink/45" onClick={onClose} aria-hidden />
        <div
          ref={ref}
          role="dialog"
          aria-modal="true"
          aria-labelledby={bare ? undefined : id}
          aria-label={bare ? title : undefined}
          tabIndex={-1}
          className={cn(
            'absolute inset-y-0 flex w-[320px] max-w-[88vw] flex-col bg-surface-muted outline-none animate-fade-up',
            side === 'left' ? 'left-0 border-r-[1.5px] border-ink' : 'right-0 border-l-[1.5px] border-ink',
            className,
          )}
        >
          {bare ? (
            children
          ) : (
            <>
              <div className="border-b border-[hsl(var(--border))] p-5">
                <Header id={id} title={title} hideTitle={hideTitle} description={description} onClose={onClose} />
              </div>
              <div className="flex-1 overflow-y-auto p-5">{children}</div>
              {footer ? <div className="flex flex-wrap justify-end gap-2 border-t border-[hsl(var(--border))] p-4">{footer}</div> : null}
            </>
          )}
        </div>
      </div>
    </Portal>
  );
}

/**
 * Bottom sheet — the mobile pattern for pickers and quick actions. With
 * `desktop="modal"` it becomes a centred dialog from `lg` up, so one
 * component serves both layouts (the quick-create menu uses this).
 */
export function CampusBottomSheet({
  open,
  onClose,
  title,
  hideTitle,
  description,
  children,
  footer,
  className,
  desktop = 'sheet',
}: OverlayProps & { desktop?: 'sheet' | 'modal' }) {
  const ref = useDialog(open, onClose);
  const id = React.useId();
  const mounted = useMounted();
  if (!open || !mounted) return null;
  const asModal = desktop === 'modal';
  return (
    <Portal>
      <div className={cn('fixed inset-0 z-[60] flex items-end justify-center', asModal && 'lg:items-center lg:p-6')}>
        <div className="absolute inset-0 bg-ink/45" onClick={onClose} aria-hidden />
        <div
          ref={ref}
          role="dialog"
          aria-modal="true"
          aria-labelledby={id}
          tabIndex={-1}
          className={cn(
            'relative max-h-[88vh] w-full overflow-y-auto rounded-t-3xl border-t-[1.5px] border-ink bg-surface px-4 pb-[calc(env(safe-area-inset-bottom)+16px)] pt-3 outline-none animate-fade-up',
            asModal && 'lg:max-w-lg lg:rounded-3xl lg:border-[1.5px] lg:p-5 lg:shadow-pop',
            className,
          )}
        >
          <div className={cn('mx-auto mb-3 h-1.5 w-10 rounded-full bg-[hsl(var(--border-strong))]', asModal && 'lg:hidden')} aria-hidden />
          <Header id={id} title={title} hideTitle={hideTitle} description={description} onClose={onClose} />
          <div className="mt-3">{children}</div>
          {footer ? <div className="mt-4 flex flex-wrap justify-end gap-2">{footer}</div> : null}
        </div>
      </div>
    </Portal>
  );
}

/**
 * Range slider on the native <input type="range">, so keyboard (arrows,
 * Page Up/Down, Home/End), screen readers and touch work for free. Shows the
 * current value, optional tick labels, and a filled track.
 */
export function CampusSlider({
  label,
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  ticks,
  format = (v) => String(v),
  valueText,
  id,
  className,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  ticks?: number[];
  format?: (value: number) => string;
  /** Screen-reader description of the value, e.g. "75 percent target". */
  valueText?: string;
  id?: string;
  className?: string;
}) {
  const autoId = React.useId();
  const inputId = id ?? autoId;
  const pct = ((value - min) / Math.max(1e-9, max - min)) * 100;
  return (
    <div className={cn('w-full', className)}>
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={inputId} className="text-[13px] font-bold text-default">
          {label}
        </label>
        <output htmlFor={inputId} className="tabular font-display text-[22px] font-extrabold text-default">
          {format(value)}
        </output>
      </div>
      <input
        id={inputId}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-valuetext={valueText ?? format(value)}
        className="campus-slider mt-3 w-full"
        style={{ ['--campus-slider-fill' as string]: `${pct}%` }}
      />
      {ticks?.length ? (
        <div className="relative mt-1 h-4 text-[11px] font-semibold text-subtle" aria-hidden>
          {ticks.map((t) => {
            const at = ((t - min) / (max - min)) * 100;
            // End labels align inward so they never overflow the track.
            const shift = at <= 0 ? 'translate-x-0' : at >= 100 ? '-translate-x-full' : '-translate-x-1/2';
            return (
              <span key={t} className={cn('absolute', shift)} style={{ left: `${at}%` }}>
                {format(t)}
              </span>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
