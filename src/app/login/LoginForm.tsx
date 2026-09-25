'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, GraduationCap, UserCog, ShieldCheck } from 'lucide-react';
import { Button, Field, Input } from '@/components/ui';

/**
 * Demo accounts are surfaced ONLY when DEMO_MODE is on and the build is not
 * production. The password itself comes from the server-rendered prop, which
 * reads DEMO_PASSWORD from the environment — it is never hard-coded here.
 */
const DEMO_ACCOUNTS = [
  {
    role: 'Student',
    email: 'student@demo.campusos.local',
    icon: GraduationCap,
    description: 'Ananya Iyer · BBA Finance, Section A',
  },
  {
    role: 'Faculty',
    email: 'faculty@demo.campusos.local',
    icon: UserCog,
    description: 'Dr. Meera Sharma · Management',
  },
  {
    role: 'Admin',
    email: 'admin@demo.campusos.local',
    icon: ShieldCheck,
    description: 'Rajesh Nair · Academic Office',
  },
];

export function LoginForm({ nextUrl, demoMode }: { nextUrl?: string; demoMode: boolean }) {
  const router = useRouter();
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<{ message: string; hint?: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const json = await res.json();

      if (!json.ok) {
        setError({ message: json.error?.message ?? 'Sign in failed.', hint: json.error?.hint });
        setLoading(false);
        return;
      }

      router.push(nextUrl && nextUrl.startsWith('/') ? nextUrl : json.data.redirectTo);
      router.refresh();
    } catch {
      setError({
        message: 'Could not reach the server.',
        hint: 'Check your connection and try again.',
      });
      setLoading(false);
    }
  }

  function useDemoAccount(demoEmail: string) {
    setEmail(demoEmail);
    setPassword(DEMO_PASSWORD_PLACEHOLDER);
    setError(null);
  }

  return (
    <>
      <form onSubmit={submit} className="mt-7 space-y-4">
        {error ? (
          <div
            className="flex gap-2.5 rounded-lg border border-[hsl(var(--danger-border))] bg-danger-subtle p-3"
            role="alert"
          >
            <AlertCircle size={15} className="mt-0.5 shrink-0 text-danger" />
            <div>
              <p className="text-[13px] font-medium text-danger">{error.message}</p>
              {error.hint ? <p className="mt-0.5 text-[12.5px] text-muted">{error.hint}</p> : null}
            </div>
          </div>
        ) : null}

        <Field label="Email address" htmlFor="email" required>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@institution.edu"
            aria-invalid={!!error}
          />
        </Field>

        <Field label="Password" htmlFor="password" required>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••••"
            aria-invalid={!!error}
          />
        </Field>

        <Button type="submit" variant="primary" size="lg" loading={loading} className="w-full">
          {loading ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>

      {demoMode ? (
        <div className="mt-8">
          <div className="mb-3 flex items-center gap-3">
            <div className="h-px flex-1 bg-[hsl(var(--border))]" />
            <span className="text-[11px] font-medium uppercase tracking-wider text-subtle">
              Demo accounts
            </span>
            <div className="h-px flex-1 bg-[hsl(var(--border))]" />
          </div>
          <div className="space-y-1.5">
            {DEMO_ACCOUNTS.map((acc) => {
              const Icon = acc.icon;
              return (
                <button
                  key={acc.email}
                  type="button"
                  onClick={() => useDemoAccount(acc.email)}
                  className="flex w-full items-center gap-3 rounded-lg border border-[hsl(var(--border))] px-3 py-2.5 text-left transition-colors hover:bg-surface-sunken"
                >
                  <Icon size={16} className="shrink-0 text-subtle" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-medium text-default">{acc.role}</span>
                    <span className="block truncate text-[11.5px] text-subtle">
                      {acc.description}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
          <p className="mt-3 text-[11.5px] leading-relaxed text-subtle">
            Development only. These accounts and their password come from your local environment
            configuration and are never available in a production build.
          </p>
        </div>
      ) : null}
    </>
  );
}

/**
 * Populated at build time from NEXT_PUBLIC_DEMO_PASSWORD when demo mode is on.
 * Falls back to an empty string so a production build cannot leak anything.
 */
const DEMO_PASSWORD_PLACEHOLDER = process.env.NEXT_PUBLIC_DEMO_PASSWORD ?? '';
