import * as React from 'react';
import { CampusIllustration, CampusSpeech, PixelRobot } from '@/components/campus';
import { CampusLogo } from '@/components/brand';

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
    <div className="flex min-h-screen bg-surface-muted">
      <main className="flex w-full flex-col justify-center px-4 py-12 sm:px-12 lg:w-[46%] lg:px-16">
        <div className="mx-auto w-full max-w-sm">
          <a href="/login" className="mb-8 inline-flex rounded-lg" aria-label="CampusOS home">
            <CampusLogo size="lg" tagline decorative />
          </a>
          <h1 className="font-display text-[26px] font-extrabold leading-tight text-default">{title}</h1>
          {subtitle ? <p className="mt-1 text-[13.5px] leading-relaxed text-muted">{subtitle}</p> : null}
          <div className="mt-7">{children}</div>
          {footer ? <div className="mt-6 text-center text-[13px] text-muted">{footer}</div> : null}
        </div>
      </main>
      <aside className="relative hidden flex-1 border-l-[1.5px] border-ink bg-lavender lg:flex" aria-hidden>
        <div className="m-auto w-full max-w-lg px-12">
          <div className="overflow-hidden rounded-2xl campus-outline bg-surface">
            <CampusIllustration name="home-hero" priority sizes="520px" />
          </div>
          <div className="mt-6 flex items-center gap-3">
            <PixelRobot size={52} />
            <CampusSpeech>Same campus. Bigger opportunities.</CampusSpeech>
          </div>
          <p className="mt-5 font-display text-[22px] font-extrabold leading-snug text-default">
            Classes, notices, attendance, events and your progress — without a dozen WhatsApp groups.
          </p>
          <p className="mt-2 text-[13.5px] leading-relaxed text-muted">
            Your college decides who can join. You decide what others can see.
          </p>
        </div>
      </aside>
    </div>
  );
}
