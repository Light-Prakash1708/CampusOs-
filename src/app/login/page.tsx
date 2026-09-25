import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/context';
import { LoginForm } from './LoginForm';

export const metadata = { title: 'Sign in' };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const user = await getCurrentUser();
  if (user) redirect(`/${user.portal}`);

  const params = await searchParams;
  const demoMode = process.env.DEMO_MODE === 'true' && process.env.NODE_ENV !== 'production';

  return (
    <div className="flex min-h-screen">
      {/* Form side */}
      <div className="flex w-full flex-col justify-center px-6 py-12 sm:px-12 lg:w-[46%] lg:px-16">
        <div className="mx-auto w-full max-w-sm">
          <div className="mb-8 flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand text-base font-bold text-white">
              C
            </span>
            <span>
              <span className="block text-[15px] font-semibold leading-tight text-default">
                CampusOS
              </span>
              <span className="block text-[11.5px] leading-tight text-subtle">
                Academic operations platform
              </span>
            </span>
          </div>

          <h1 className="text-xl font-semibold tracking-[-0.01em] text-default">Sign in</h1>
          <p className="mt-1 text-[13.5px] text-muted">
            Use the account issued by your institution.
          </p>

          <LoginForm nextUrl={params.next} demoMode={demoMode} />
        </div>
      </div>

      {/* Brand side — hidden on small screens rather than shrunk */}
      <div className="relative hidden flex-1 overflow-hidden border-l border-[hsl(var(--border))] bg-surface-sunken lg:block">
        <div className="flex h-full flex-col justify-center px-16">
          <blockquote className="max-w-md">
            <p className="text-[22px] font-medium leading-relaxed tracking-[-0.01em] text-default">
              One campus. One source of truth. One place where students, faculty and
              administrators see the same thing.
            </p>
            <footer className="mt-5 text-[13px] leading-relaxed text-muted">
              CampusOS replaces scattered WhatsApp groups, conflicting spreadsheets and repeated
              notices with a single coordinated system — and refuses to publish anything that
              conflicts with what is already scheduled.
            </footer>
          </blockquote>

          <dl className="mt-12 grid max-w-md grid-cols-2 gap-x-8 gap-y-6">
            {[
              ['Conflict prevention', 'Rooms, faculty and sections are checked before anything is published.'],
              ['Acknowledged notices', 'See exactly who has read a notice and who has not.'],
              ['Explained changes', 'Every change shows what moved, why, and who approved it.'],
              ['Human approval', 'AI proposes; a person decides. Always.'],
            ].map(([title, body]) => (
              <div key={title}>
                <dt className="text-[13px] font-semibold text-default">{title}</dt>
                <dd className="mt-1 text-[12.5px] leading-relaxed text-muted">{body}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </div>
  );
}
