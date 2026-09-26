'use client';

import * as React from 'react';
import { GraduationCap, MailOpen } from 'lucide-react';
import { cn } from '@/lib/utils';
import { StudentSignupForm } from './StudentSignupForm';
import { RegisterForm } from './RegisterForm';

type College = React.ComponentProps<typeof RegisterForm>['colleges'][number];

/**
 * "I'm a student" (sign up on your own) or "My college invited me" (the
 * college's own onboarding: an invitation link, or the college's registration
 * form where the college allows it).
 */
export function RegisterChooser({ selfRegistration, colleges }: { selfRegistration: boolean; colleges: College[] }) {
  const [path, setPath] = React.useState<'student' | 'college'>(selfRegistration ? 'student' : 'college');

  const options = [
    ...(selfRegistration
      ? [{ id: 'student' as const, icon: GraduationCap, title: 'I’m a student', body: 'Create your own account in a minute.' }]
      : []),
    { id: 'college' as const, icon: MailOpen, title: 'My college invited me', body: 'Join through your college.' },
  ];

  return (
    <div className="space-y-5">
      {options.length > 1 ? (
        <div className="grid grid-cols-1 gap-2 min-[400px]:grid-cols-2" role="radiogroup" aria-label="How are you joining?">
          {options.map((o) => {
            const Icon = o.icon;
            const active = path === o.id;
            return (
              <button
                key={o.id}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setPath(o.id)}
                className={cn(
                  'flex min-w-0 items-start gap-2.5 rounded-xl border-[1.5px] p-3 text-left transition-colors',
                  active ? 'border-ink bg-lavender shadow-pop' : 'border-[hsl(var(--border-strong))] bg-surface hover:border-ink',
                )}
              >
                <Icon size={18} className="mt-0.5 shrink-0 text-lavender-ink" aria-hidden />
                <span className="min-w-0">
                  <span className="block text-[13.5px] font-bold text-default">{o.title}</span>
                  <span className="block text-[12px] leading-snug text-muted">{o.body}</span>
                </span>
              </button>
            );
          })}
        </div>
      ) : null}

      {path === 'student' ? (
        <StudentSignupForm />
      ) : (
        <CollegePath colleges={colleges} />
      )}
    </div>
  );
}

function CollegePath({ colleges }: { colleges: College[] }) {
  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-[hsl(var(--border))] bg-surface-sunken p-4 text-[13.5px] leading-relaxed text-muted">
        <p className="font-semibold text-default">Got an invitation email?</p>
        <p className="mt-1">
          Open the link in the email from your college. It sets up your college account directly — no form needed.
        </p>
      </div>
      {colleges.length > 0 ? (
        <>
          <p className="text-[13px] font-semibold text-default">Or register with a college that accepts sign-ups</p>
          <RegisterForm colleges={colleges} />
        </>
      ) : (
        <p className="text-[13px] leading-relaxed text-muted">
          No college on this server accepts direct sign-ups yet. If your college uses CampusOS, ask the college office
          for an invitation.
        </p>
      )}
    </div>
  );
}
