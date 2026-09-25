import * as React from 'react';
import {
  ArrowRight, Award, BookOpenText, Bot, Briefcase, Calculator, CalendarDays, CalendarPlus, CheckCircle2,
  FolderLock, GraduationCap, ListChecks, MapPinned, NotebookPen, Ticket, BellRing, type LucideIcon, Target } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ResolvedTool, ToolIconKey } from '@/lib/tools';
import { CampusComingSoon, TONE_BG, TONE_INK, type Tone } from './index';
import { ToolOpenLink } from './ToolOpenLink';

export const TOOL_ICONS: Record<ToolIconKey, LucideIcon> = {
  attendance: CheckCircle2,
  timetable: CalendarDays,
  jobs: Briefcase,
  events: Ticket,
  calculator: Calculator,
  documents: FolderLock,
  subjects: ListChecks,
  reminders: BellRing,
  notes: BookOpenText,
  planner: NotebookPen,
  cgpa: GraduationCap,
  rooms: MapPinned,
  assistant: Bot,
  certificates: Award,
  host: CalendarPlus,
  goals: Target,
};

function ToolIcon({ tool, size = 'md' }: { tool: ResolvedTool; size?: 'sm' | 'md' }) {
  const Icon = TOOL_ICONS[tool.icon];
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-xl border-[1.5px] border-ink bg-surface',
        size === 'md' ? 'h-11 w-11' : 'h-9 w-9',
        TONE_INK[tool.tone as Tone],
      )}
      aria-hidden
    >
      <Icon size={size === 'md' ? 21 : 17} strokeWidth={2.2} />
    </span>
  );
}

/**
 * Tool card. `variant="feature"` is the large first-row card from the
 * reference (icon · title · copy · live highlight · dark CTA bar);
 * `variant="compact"` is the smaller "more things you'll love" card.
 *
 * States (from src/lib/tools.ts):
 *   AVAILABLE → the whole CTA is a real link (counted as an "open")
 *   PLANNED   → "Coming in Phase N", nothing clickable
 *   DISABLED  → "Off at your college", nothing clickable
 */
export function CampusToolCard({
  tool,
  variant = 'compact',
  highlight,
  className,
}: {
  tool: ResolvedTool;
  variant?: 'feature' | 'compact';
  /** Live, real data for this student (e.g. their attendance %). Optional. */
  highlight?: React.ReactNode;
  className?: string;
}) {
  const available = tool.status === 'AVAILABLE' && tool.href;
  const tone = tool.tone as Tone;
  const muted = !available;

  if (variant === 'feature') {
    return (
      <article
        className={cn(
          'flex h-full flex-col rounded-2xl border-[1.5px] border-ink p-4 shadow-pop',
          muted ? 'bg-surface-raised' : TONE_BG[tone],
          className,
        )}
        aria-labelledby={`tool-${tool.key}`}
      >
        <div className="flex flex-wrap items-start justify-between gap-2">
          <ToolIcon tool={tool} />
          {tool.statusLabel ? <CampusComingSoon label={tool.statusLabel} className="hidden sm:inline-flex" /> : null}
        </div>
        <h3 id={`tool-${tool.key}`} className="mt-3 font-display text-[16px] font-extrabold leading-tight text-default sm:text-[18px]">
          {tool.title}
        </h3>
        <p className="mt-1 hidden text-[13px] leading-snug text-muted sm:block">{tool.description}</p>
        {highlight ? <div className="mt-3 hidden sm:block">{highlight}</div> : null}
        <div className="mt-auto pt-4">
          {available ? (
            <ToolOpenLink
              tool={tool.key}
              href={tool.href!}
              className="flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border-[1.5px] border-ink bg-ink px-3 text-center text-[12.5px] font-bold text-white shadow-pop campus-press sm:px-4 sm:text-[13.5px]"
            >
              {tool.cta ?? 'Open'} <ArrowRight size={15} aria-hidden />
            </ToolOpenLink>
          ) : (
            <p className="flex min-h-[44px] items-center justify-center rounded-xl border-[1.5px] border-dashed border-[hsl(var(--border-strong))] px-3 text-center text-[12px] font-bold text-subtle sm:text-[12.5px]">
              {tool.status === 'DISABLED' ? 'Your college has turned this off' : (
                <>
                  <span className="sm:hidden">{tool.statusLabel}</span>
                  <span className="hidden sm:inline">Not open yet</span>
                </>
              )}
            </p>
          )}
        </div>
      </article>
    );
  }

  const inner = (
    <>
      <div className="flex items-center gap-2.5">
        <ToolIcon tool={tool} size="sm" />
        <h3 id={`tool-${tool.key}`} className="min-w-0 flex-1 text-[14px] font-extrabold leading-tight text-default">
          {tool.title}
        </h3>
        {available ? <ArrowRight size={15} className="shrink-0 text-subtle transition-transform group-hover:translate-x-0.5" aria-hidden /> : null}
      </div>
      <p className="mt-2 hidden text-[12.5px] leading-snug text-muted sm:block">{tool.description}</p>
      {tool.statusLabel ? <CampusComingSoon label={tool.statusLabel} className="mt-2.5" /> : null}
    </>
  );
  const cls = cn(
    'group block h-full rounded-2xl border-[1.5px] p-3.5',
    available ? cn('border-ink shadow-pop campus-press', TONE_BG[tone]) : 'border-dashed border-[hsl(var(--border-strong))] bg-surface',
    className,
  );
  return available ? (
    <ToolOpenLink tool={tool.key} href={tool.href!} className={cls} aria-label={`${tool.title}: ${tool.cta ?? 'Open'}`}>
      {inner}
    </ToolOpenLink>
  ) : (
    <article className={cls} aria-labelledby={`tool-${tool.key}`}>
      {inner}
    </article>
  );
}
