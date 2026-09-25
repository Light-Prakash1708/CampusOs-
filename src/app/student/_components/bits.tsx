import Link from 'next/link';
import {
  BookOpen,
  Building2,
  CalendarDays,
  GraduationCap,
  Megaphone,
  PartyPopper,
  Siren,
  Sparkles,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import { Card, CardBody, type BadgeTone } from '@/components/ui';
import { cn } from '@/lib/utils';

/* Shared, presentational-only helpers for the student portal. Everything here
   is a Server Component — no state, no effects. */

export function priorityTone(priority: string): BadgeTone {
  switch (priority) {
    case 'CRITICAL':
      return 'danger';
    case 'IMPORTANT':
      return 'warning';
    case 'INFORMATIONAL':
      return 'neutral';
    default:
      return 'info';
  }
}

export function categoryIcon(category: string): LucideIcon {
  switch (category) {
    case 'ACADEMIC':
      return BookOpen;
    case 'EXAMINATION':
      return GraduationCap;
    case 'EVENT':
      return PartyPopper;
    case 'HOLIDAY':
      return CalendarDays;
    case 'EMERGENCY':
      return Siren;
    case 'PLACEMENT':
      return Sparkles;
    case 'FACILITY':
      return Wrench;
    case 'ADMINISTRATIVE':
      return Building2;
    default:
      return Megaphone;
  }
}

export function grievanceStatusTone(status: string): BadgeTone {
  switch (status) {
    case 'RESOLVED':
    case 'CLOSED':
      return 'success';
    case 'AWAITING_INFORMATION':
    case 'RESOLUTION_PROPOSED':
      return 'warning';
    case 'WITHDRAWN':
      return 'neutral';
    case 'REOPENED':
      return 'danger';
    default:
      return 'info';
  }
}

export function urgencyTone(urgency: string): BadgeTone {
  switch (urgency) {
    case 'CRITICAL':
      return 'danger';
    case 'HIGH':
      return 'warning';
    case 'LOW':
      return 'neutral';
    default:
      return 'info';
  }
}

/**
 * Shown when a student opens a route for a module the institution has not
 * bought or has switched off. The navigation already hides it; this covers the
 * direct-link case with an explanation instead of a broken page.
 */
export function ModuleDisabled({ module, blurb }: { module: string; blurb: string }) {
  return (
    <Card>
      <CardBody className="py-10 text-center">
        <p className="text-sm font-medium text-default">{module} is not enabled here</p>
        <p className="mx-auto mt-1 max-w-sm text-[13px] leading-relaxed text-muted">{blurb}</p>
        <p className="mt-3 text-[12.5px] text-subtle">
          Your institution controls this module. Ask the administration office if you think it
          should be available to you.
        </p>
      </CardBody>
    </Card>
  );
}

export function SubjectTag({ code, name }: { code: string; name?: string }) {
  return (
    <span className="inline-flex min-w-0 items-baseline gap-1.5">
      <span className="tabular shrink-0 rounded bg-surface-sunken px-1.5 py-0.5 text-[11px] font-semibold text-muted">
        {code}
      </span>
      {name ? <span className="truncate text-[13px] text-default">{name}</span> : null}
    </span>
  );
}

/** "Ask AI about this" — deep links the assistant with a prefilled question. */
export function AskAiLink({
  question,
  label = 'Ask AI about this',
  className,
}: {
  question: string;
  label?: string;
  className?: string;
}) {
  return (
    <Link
      href={`/student/assistant?q=${encodeURIComponent(question)}`}
      className={cn(
        'inline-flex items-center gap-1.5 text-[12.5px] font-medium text-brand hover:underline',
        className,
      )}
    >
      <Sparkles size={13} aria-hidden />
      {label}
    </Link>
  );
}

/** Renders stored plain-text bodies with their paragraph breaks intact. */
export function ProseBody({ text, className }: { text: string; className?: string }) {
  const paragraphs = text.split(/\n{2,}/).filter((p) => p.trim().length > 0);
  return (
    <div className={cn('space-y-2.5 text-[13.5px] leading-relaxed text-default', className)}>
      {paragraphs.map((p, i) => (
        <p key={i} className="whitespace-pre-line">
          {p}
        </p>
      ))}
    </div>
  );
}
