import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cn } from '@/lib/utils';
import { Loader2, type LucideIcon } from 'lucide-react';

/* ==========================================================================
   CampusOS UI primitives
   --------------------------------------------------------------------------
   Every screen is composed from these. Building pages independently is how
   design systems rot, so new surfaces must reuse or extend what is here.
   ========================================================================== */

/* --------------------------------- Button -------------------------------- */

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'subtle' | 'link';
type ButtonSize = 'sm' | 'md' | 'lg' | 'icon';

const buttonVariants: Record<ButtonVariant, string> = {
  primary:
    'bg-brand text-white hover:bg-[hsl(var(--brand-hover))] shadow-xs disabled:bg-[hsl(var(--brand))]',
  secondary:
    'bg-surface border border-[hsl(var(--border-strong))] text-default hover:bg-surface-sunken shadow-xs',
  ghost: 'text-muted hover:bg-surface-sunken hover:text-default',
  danger: 'bg-danger text-white hover:brightness-110 shadow-xs',
  subtle: 'bg-surface-sunken text-default hover:bg-[hsl(var(--border))]',
  link: 'text-brand underline-offset-4 hover:underline',
};

const buttonSizes: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-[13px] gap-1.5 rounded-md',
  md: 'h-9 px-3.5 text-sm gap-2 rounded-md',
  lg: 'h-11 px-5 text-[15px] gap-2 rounded-lg',
  icon: 'h-9 w-9 rounded-md',
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: LucideIcon;
  iconRight?: LucideIcon;
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    className,
    variant = 'secondary',
    size = 'md',
    loading = false,
    icon: Icon,
    iconRight: IconRight,
    asChild = false,
    children,
    disabled,
    ...props
  },
  ref,
) {
  const Comp = asChild ? Slot : 'button';
  const iconSize = size === 'sm' ? 14 : size === 'lg' ? 18 : 16;

  return (
    <Comp
      ref={ref}
      className={cn(
        'inline-flex items-center justify-center font-medium whitespace-nowrap transition-colors',
        'disabled:pointer-events-none disabled:opacity-50',
        buttonVariants[variant],
        buttonSizes[size],
        className,
      )}
      disabled={disabled || loading}
      {...props}
    >
      {asChild ? (
        children
      ) : (
        <>
          {loading ? (
            <Loader2 size={iconSize} className="animate-spin" aria-hidden />
          ) : Icon ? (
            <Icon size={iconSize} aria-hidden />
          ) : null}
          {children}
          {IconRight && !loading ? <IconRight size={iconSize} aria-hidden /> : null}
        </>
      )}
    </Comp>
  );
});

/* ---------------------------------- Card --------------------------------- */

export function Card({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'bg-surface-raised border border-[hsl(var(--border))] rounded-xl shadow-xs',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  description,
  action,
  icon: Icon,
  className,
  children,
}: {
  title?: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  icon?: LucideIcon;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        'flex items-start justify-between gap-4 px-5 py-4 border-b border-[hsl(var(--border))]',
        className,
      )}
    >
      <div className="min-w-0">
        {title ? (
          <h2 className="text-[15px] font-semibold text-default flex items-center gap-2">
            {Icon ? <Icon size={16} className="text-subtle shrink-0" aria-hidden /> : null}
            {title}
          </h2>
        ) : null}
        {description ? (
          <p className="text-[13px] text-muted mt-0.5 leading-relaxed">{description}</p>
        ) : null}
        {children}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function CardBody({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn('p-5', className)}>{children}</div>;
}

export function CardFooter({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        'px-5 py-3 border-t border-[hsl(var(--border))] bg-surface-muted rounded-b-xl',
        className,
      )}
    >
      {children}
    </div>
  );
}

/* --------------------------------- Badge --------------------------------- */

export type BadgeTone =
  | 'neutral'
  | 'brand'
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'
  | 'outline';

const badgeTones: Record<BadgeTone, string> = {
  neutral: 'bg-surface-sunken text-muted border-[hsl(var(--border))]',
  brand: 'bg-brand-subtle text-brand border-[hsl(var(--brand-border))]',
  success: 'bg-success-subtle text-success border-[hsl(var(--success-border))]',
  warning: 'bg-warning-subtle text-warning border-[hsl(var(--warning-border))]',
  danger: 'bg-danger-subtle text-danger border-[hsl(var(--danger-border))]',
  info: 'bg-info-subtle text-info border-[hsl(var(--info-border))]',
  outline: 'bg-transparent text-muted border-[hsl(var(--border-strong))]',
};

export function Badge({
  tone = 'neutral',
  children,
  className,
  dot = false,
  icon: Icon,
}: {
  tone?: BadgeTone;
  children: React.ReactNode;
  className?: string;
  dot?: boolean;
  icon?: LucideIcon;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11.5px] font-medium leading-5 whitespace-nowrap',
        badgeTones[tone],
        className,
      )}
    >
      {dot ? <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" aria-hidden /> : null}
      {Icon ? <Icon size={12} aria-hidden /> : null}
      {children}
    </span>
  );
}

/* --------------------------------- Input --------------------------------- */

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return (
      <input
        ref={ref}
        className={cn(
          'h-9 w-full rounded-md border border-[hsl(var(--border-strong))] bg-surface px-3 text-sm',
          'text-default placeholder:text-[hsl(var(--text-subtle))]',
          'transition-shadow focus:border-[hsl(var(--brand))] focus:ring-2 focus:ring-[hsl(var(--brand))]/15',
          'disabled:cursor-not-allowed disabled:bg-surface-sunken disabled:text-subtle',
          'aria-[invalid=true]:border-[hsl(var(--danger))] aria-[invalid=true]:ring-2 aria-[invalid=true]:ring-[hsl(var(--danger))]/15',
          className,
        )}
        {...props}
      />
    );
  },
);

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className, ...props }, ref) {
  return (
    <textarea
      ref={ref}
      className={cn(
        'w-full rounded-md border border-[hsl(var(--border-strong))] bg-surface px-3 py-2 text-sm leading-relaxed',
        'text-default placeholder:text-[hsl(var(--text-subtle))]',
        'transition-shadow focus:border-[hsl(var(--brand))] focus:ring-2 focus:ring-[hsl(var(--brand))]/15',
        'disabled:cursor-not-allowed disabled:bg-surface-sunken',
        className,
      )}
      {...props}
    />
  );
});

export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(function Select({ className, children, ...props }, ref) {
  return (
    <select
      ref={ref}
      className={cn(
        'h-9 w-full rounded-md border border-[hsl(var(--border-strong))] bg-surface px-2.5 text-sm text-default',
        'transition-shadow focus:border-[hsl(var(--brand))] focus:ring-2 focus:ring-[hsl(var(--brand))]/15',
        'disabled:cursor-not-allowed disabled:bg-surface-sunken',
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
});

export function Field({
  label,
  htmlFor,
  hint,
  error,
  required,
  children,
  className,
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <label htmlFor={htmlFor} className="block text-[13px] font-medium text-default">
        {label}
        {required ? (
          <span className="text-danger ml-0.5" aria-label="required">
            *
          </span>
        ) : null}
      </label>
      {children}
      {error ? (
        <p className="text-[12.5px] text-danger flex items-start gap-1">{error}</p>
      ) : hint ? (
        <p className="text-[12.5px] text-subtle">{hint}</p>
      ) : null}
    </div>
  );
}

/* --------------------------------- States -------------------------------- */

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center px-6 py-12 text-center', className)}>
      {Icon ? (
        <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-surface-sunken">
          <Icon size={20} className="text-subtle" aria-hidden />
        </div>
      ) : null}
      <p className="text-sm font-medium text-default">{title}</p>
      {description ? (
        <p className="mt-1 max-w-sm text-[13px] leading-relaxed text-muted">{description}</p>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function ErrorState({
  title = 'Something did not load',
  message,
  hint,
  action,
  reference,
}: {
  title?: string;
  message: string;
  hint?: string;
  action?: React.ReactNode;
  reference?: string;
}) {
  return (
    <div className="rounded-lg border border-[hsl(var(--danger-border))] bg-danger-subtle p-4">
      <p className="text-sm font-semibold text-danger">{title}</p>
      <p className="mt-1 text-[13px] leading-relaxed text-default">{message}</p>
      {hint ? <p className="mt-1.5 text-[12.5px] text-muted">{hint}</p> : null}
      {reference ? (
        <p className="mt-2 font-mono text-[11.5px] text-subtle">Reference: {reference}</p>
      ) : null}
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton', className)} aria-hidden />;
}

export function SkeletonRows({ rows = 4, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn('space-y-2.5', className)} aria-busy="true" aria-live="polite">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-11 w-full" />
      ))}
    </div>
  );
}

/* --------------------------------- Layout -------------------------------- */

export function PageHeader({
  title,
  description,
  action,
  breadcrumb,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  breadcrumb?: React.ReactNode;
}) {
  return (
    <div className="mb-5">
      {breadcrumb ? <div className="mb-1.5">{breadcrumb}</div> : null}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-[-0.01em] text-default">{title}</h1>
          {description ? (
            <p className="mt-1 text-[13.5px] leading-relaxed text-muted">{description}</p>
          ) : null}
        </div>
        {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
      </div>
    </div>
  );
}

export function Section({
  title,
  description,
  action,
  children,
  className,
}: {
  title?: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('mb-6', className)}>
      {title ? (
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            <h2 className="text-[13px] font-semibold uppercase tracking-wide text-subtle">
              {title}
            </h2>
            {description ? <p className="mt-0.5 text-[13px] text-muted">{description}</p> : null}
          </div>
          {action}
        </div>
      ) : null}
      {children}
    </section>
  );
}

/* ---------------------------------- Table -------------------------------- */

export function Table({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className="overflow-x-auto">
      <table className={cn('w-full border-collapse text-sm', className)}>{children}</table>
    </div>
  );
}

export function Th({
  children,
  className,
  align = 'left',
}: {
  children?: React.ReactNode;
  className?: string;
  align?: 'left' | 'right' | 'center';
}) {
  return (
    <th
      scope="col"
      className={cn(
        'border-b border-[hsl(var(--border))] px-4 py-2.5 text-[12px] font-semibold uppercase tracking-wide text-subtle',
        align === 'right' && 'text-right',
        align === 'center' && 'text-center',
        align === 'left' && 'text-left',
        className,
      )}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  className,
  align = 'left',
}: {
  children?: React.ReactNode;
  className?: string;
  align?: 'left' | 'right' | 'center';
}) {
  return (
    <td
      className={cn(
        'border-b border-[hsl(var(--border))] px-4 py-3 text-default align-middle',
        align === 'right' && 'text-right',
        align === 'center' && 'text-center',
        className,
      )}
    >
      {children}
    </td>
  );
}

/* --------------------------------- Avatar -------------------------------- */

export function Avatar({
  name,
  src,
  size = 32,
  className,
}: {
  name: string;
  src?: string | null;
  size?: number;
  className?: string;
}) {
  const text = name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');

  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={src}
        alt=""
        width={size}
        height={size}
        className={cn('rounded-full object-cover', className)}
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <span
      aria-hidden
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full bg-brand-subtle font-semibold text-brand',
        className,
      )}
      style={{ width: size, height: size, fontSize: Math.max(10, size * 0.36) }}
    >
      {text || '?'}
    </span>
  );
}

/* ------------------------------ Stat display ----------------------------- */

export function Stat({
  label,
  value,
  sublabel,
  tone = 'neutral',
  icon: Icon,
  trend,
}: {
  label: string;
  value: React.ReactNode;
  sublabel?: React.ReactNode;
  tone?: BadgeTone;
  icon?: LucideIcon;
  trend?: { value: string; direction: 'up' | 'down' | 'flat' };
}) {
  const toneText: Record<BadgeTone, string> = {
    neutral: 'text-default',
    brand: 'text-brand',
    success: 'text-success',
    warning: 'text-warning',
    danger: 'text-danger',
    info: 'text-info',
    outline: 'text-default',
  };

  return (
    <div className="rounded-xl border border-[hsl(var(--border))] bg-surface-raised p-4 shadow-xs">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[12.5px] font-medium text-muted">{label}</p>
        {Icon ? <Icon size={15} className="text-subtle shrink-0" aria-hidden /> : null}
      </div>
      <p className={cn('mt-1.5 text-2xl font-semibold tabular tracking-[-0.02em]', toneText[tone])}>
        {value}
      </p>
      {sublabel || trend ? (
        <div className="mt-1 flex items-center gap-2 text-[12px] text-subtle">
          {trend ? (
            <span
              className={cn(
                'font-medium',
                trend.direction === 'up' && 'text-success',
                trend.direction === 'down' && 'text-danger',
              )}
            >
              {trend.direction === 'up' ? '▲' : trend.direction === 'down' ? '▼' : '—'}{' '}
              {trend.value}
            </span>
          ) : null}
          {sublabel}
        </div>
      ) : null}
    </div>
  );
}

/* --------------------------------- Alert --------------------------------- */

export function Alert({
  tone = 'info',
  title,
  children,
  icon: Icon,
  action,
  className,
}: {
  tone?: 'info' | 'success' | 'warning' | 'danger' | 'brand';
  title?: string;
  children?: React.ReactNode;
  icon?: LucideIcon;
  action?: React.ReactNode;
  className?: string;
}) {
  const tones = {
    info: 'bg-info-subtle border-[hsl(var(--info-border))] text-info',
    success: 'bg-success-subtle border-[hsl(var(--success-border))] text-success',
    warning: 'bg-warning-subtle border-[hsl(var(--warning-border))] text-warning',
    danger: 'bg-danger-subtle border-[hsl(var(--danger-border))] text-danger',
    brand: 'bg-brand-subtle border-[hsl(var(--brand-border))] text-brand',
  };

  return (
    <div className={cn('rounded-lg border p-3.5', tones[tone], className)} role="status">
      <div className="flex gap-2.5">
        {Icon ? <Icon size={16} className="mt-0.5 shrink-0" aria-hidden /> : null}
        <div className="min-w-0 flex-1">
          {title ? <p className="text-[13.5px] font-semibold">{title}</p> : null}
          {children ? (
            <div className={cn('text-[13px] leading-relaxed text-default', title && 'mt-0.5')}>
              {children}
            </div>
          ) : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
    </div>
  );
}

/* -------------------------------- Progress ------------------------------- */

export function Progress({
  value,
  max = 100,
  tone = 'brand',
  className,
  showLabel = false,
}: {
  value: number;
  max?: number;
  tone?: 'brand' | 'success' | 'warning' | 'danger';
  className?: string;
  showLabel?: boolean;
}) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const bg = {
    brand: 'bg-brand',
    success: 'bg-success',
    warning: 'bg-warning',
    danger: 'bg-danger',
  }[tone];

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div
        className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-sunken"
        role="progressbar"
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div className={cn('h-full rounded-full transition-all', bg)} style={{ width: `${pct}%` }} />
      </div>
      {showLabel ? (
        <span className="tabular text-[12px] font-medium text-muted">{Math.round(pct)}%</span>
      ) : null}
    </div>
  );
}

/* -------------------------------- Divider -------------------------------- */

export function Divider({ className, label }: { className?: string; label?: string }) {
  if (label) {
    return (
      <div className={cn('flex items-center gap-3', className)}>
        <div className="h-px flex-1 bg-[hsl(var(--border))]" />
        <span className="text-[11.5px] font-medium uppercase tracking-wide text-subtle">
          {label}
        </span>
        <div className="h-px flex-1 bg-[hsl(var(--border))]" />
      </div>
    );
  }
  return <div className={cn('h-px w-full bg-[hsl(var(--border))]', className)} />;
}

/* ------------------------------ AI attribution --------------------------- */

/**
 * Marks content produced by AI. Product rule: AI output is visibly labelled
 * until a human approves it. This component is the only sanctioned way to do
 * that, so the treatment stays consistent everywhere.
 */
export function AiLabel({
  state = 'generated',
  className,
}: {
  state?: 'generated' | 'approved' | 'suggestion';
  className?: string;
}) {
  const config = {
    generated: { tone: 'warning' as const, text: 'AI generated · needs review' },
    suggestion: { tone: 'info' as const, text: 'AI suggestion' },
    approved: { tone: 'success' as const, text: 'Reviewed and approved' },
  }[state];

  return (
    <Badge tone={config.tone} dot className={className}>
      {config.text}
    </Badge>
  );
}

/**
 * Estimated-time-saved chip. Always says "estimated" — we never present these
 * as measured facts.
 */
export function EstimateChip({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-md bg-surface-sunken px-1.5 py-0.5 text-[11.5px] text-subtle"
      title="Estimated using the institution's configured baseline, not a measured value."
    >
      ~{children}
    </span>
  );
}
