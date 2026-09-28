import { ArrowRight, Building2, GraduationCap, Presentation } from 'lucide-react';

const PATHS = [
  { href: '/register', icon: GraduationCap, title: 'I’m a student', body: 'Sign up in a minute, then join your college.' },
  { href: '/register?as=staff', icon: Presentation, title: 'Faculty / staff', body: 'Your college office invites you by email.' },
  { href: '/register-college', icon: Building2, title: 'Register your college', body: 'Start a pilot with one department.' },
] as const;

/** The ways into CampusOS, under the sign-in form. Links only — no roles are chosen here. */
export function JoinPaths() {
  return (
    <nav aria-labelledby="join-paths-h" className="mt-6">
      <h2 id="join-paths-h" className="text-[13px] font-bold text-default">New to CampusOS?</h2>
      <ul className="mt-2 divide-y divide-[hsl(var(--border))] rounded-xl border border-[hsl(var(--border))] bg-surface">
        {PATHS.map(({ href, icon: Icon, title, body }) => (
          <li key={href}>
            <a href={href} className="flex min-h-[52px] items-center gap-3 px-4 py-2.5 hover:bg-surface-sunken">
              <Icon size={18} className="shrink-0 text-lavender-ink" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block text-[13.5px] font-bold text-default">{title}</span>
                <span className="block text-[12px] leading-snug text-muted">{body}</span>
              </span>
              <ArrowRight size={15} className="shrink-0 text-subtle" aria-hidden />
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
