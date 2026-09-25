import * as React from 'react';

/**
 * Shared frame for the signed-out screens (sign in, register, password reset,
 * email confirmation, invitations). Single calm column; the brand panel is
 * shown on wide screens only.
 */
export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen bg-surface">
      <main className="flex w-full flex-col justify-center px-4 py-12 sm:px-12 lg:w-[46%] lg:px-16">
        <div className="mx-auto w-full max-w-sm">
          <a href="/login" className="mb-8 flex items-center gap-2.5" aria-label="CampusOS home">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand text-base font-bold text-white">
              C
            </span>
            <span>
              <span className="block text-[15px] font-semibold leading-tight text-default">CampusOS</span>
              <span className="block text-[11.5px] leading-tight text-subtle">Your college. Your campus. Your progress.</span>
            </span>
          </a>
          <h1 className="text-xl font-semibold tracking-[-0.01em] text-default">{title}</h1>
          {subtitle ? <p className="mt-1 text-[13.5px] leading-relaxed text-muted">{subtitle}</p> : null}
          <div className="mt-7">{children}</div>
          {footer ? <div className="mt-6 text-center text-[13px] text-muted">{footer}</div> : null}
        </div>
      </main>
      <aside className="relative hidden flex-1 border-l border-[hsl(var(--border))] bg-surface-sunken lg:block" aria-hidden>
        <div className="flex h-full flex-col justify-center px-16">
          <p className="max-w-md text-[22px] font-medium leading-relaxed tracking-[-0.01em] text-default">
            One place for your classes, notices, attendance, events and progress — without a dozen
            WhatsApp groups.
          </p>
          <p className="mt-5 max-w-md text-[13px] leading-relaxed text-muted">
            Your institution decides who can join. You decide what others can see.
          </p>
        </div>
      </aside>
    </div>
  );
}
