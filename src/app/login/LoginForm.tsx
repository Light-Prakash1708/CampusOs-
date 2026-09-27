'use client';

import * as React from 'react';
import { safeReturnPath } from '@/lib/utils';
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

export function LoginForm({
  nextUrl,
  demoMode,
  demoPassword,
  notice,
}: {
  nextUrl?: string;
  demoMode: boolean;
  demoPassword: string;
  notice?: string | null;
}) {
  const router = useRouter();
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<{ message: string; hint?: string; code?: string } | null>(null);
  const [resent, setResent] = React.useState(false);
  // Two-step sign-in (CAMPUSOS-018): set once the password was accepted.
  const [challenge, setChallenge] = React.useState<string | null>(null);
  const [code, setCode] = React.useState('');
  const [useRecovery, setUseRecovery] = React.useState(false);

  async function submitCode(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/mfa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(useRecovery ? { challenge, recoveryCode: code } : { challenge, code }),
      });
      const json = await res.json();
      if (!json.ok) {
        if (json.error?.code === 'CHALLENGE_EXPIRED') setChallenge(null);
        setError({ message: json.error?.message ?? 'That code isn’t right.', hint: json.error?.hint, code: json.error?.code });
        setLoading(false);
        return;
      }
      const safeNext = safeReturnPath(nextUrl, window.location.origin);
      router.push(safeNext ?? json.data.redirectTo);
      router.refresh();
    } catch {
      setError({ message: 'Could not reach the server.', hint: 'Check your connection and try again.' });
      setLoading(false);
    }
  }

  async function resendVerification() {
    await fetch('/api/auth/verify-email/resend', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    }).catch(() => undefined);
    setResent(true);
  }

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
        setError({ message: json.error?.message ?? 'Sign in failed.', hint: json.error?.hint, code: json.error?.code });
        setLoading(false);
        return;
      }

      if (json.data.mfaRequired) {
        setChallenge(json.data.challenge);
        setPassword('');
        setLoading(false);
        return;
      }

      // Only same-site relative paths are honoured ("//evil.com" is protocol-relative).
      const safeNext = safeReturnPath(nextUrl, window.location.origin);
      router.push(json.data.mustChangePassword ? json.data.redirectTo : (safeNext ?? json.data.redirectTo));
      router.refresh();
    } catch {
      setError({
        message: 'Could not reach the server.',
        hint: 'Check your connection and try again.',
      });
      setLoading(false);
    }
  }

  function applyDemoAccount(demoEmail: string) {
    setEmail(demoEmail);
    setPassword(demoPassword);
    setError(null);
  }

  if (challenge) {
    return (
      <form onSubmit={submitCode} className="space-y-4" noValidate>
        {error ? (
          <div className="flex gap-2.5 rounded-lg border border-[hsl(var(--danger-border))] bg-danger-subtle p-3" role="alert">
            <AlertCircle size={15} className="mt-0.5 shrink-0 text-danger" />
            <div>
              <p className="text-[13px] font-medium text-danger">{error.message}</p>
              {error.hint ? <p className="mt-0.5 text-[12.5px] text-muted">{error.hint}</p> : null}
            </div>
          </div>
        ) : null}
        <Field
          label={useRecovery ? 'Recovery code' : 'Code from your authenticator app'}
          htmlFor="mfa-code"
          hint={useRecovery ? 'Each recovery code works once.' : 'Six digits. A new code appears every 30 seconds.'}
        >
          <Input
            id="mfa-code"
            autoFocus
            autoComplete="one-time-code"
            inputMode={useRecovery ? 'text' : 'numeric'}
            maxLength={useRecovery ? 24 : 6}
            value={code}
            onChange={(e) => setCode(useRecovery ? e.target.value : e.target.value.replace(/\D/g, ''))}
          />
        </Field>
        <Button type="submit" variant="primary" size="lg" className="w-full" loading={loading} disabled={useRecovery ? code.length < 8 : code.length !== 6}>
          Verify
        </Button>
        <button type="button" className="text-[12.5px] font-medium text-brand hover:underline" onClick={() => { setUseRecovery((v) => !v); setCode(''); setError(null); }}>
          {useRecovery ? 'Use a code from your app instead' : 'Lost your phone? Use a recovery code'}
        </button>
      </form>
    );
  }

  return (
    <>
      <form onSubmit={submit} className="space-y-4">
        {error ? (
          <div
            className="flex gap-2.5 rounded-lg border border-[hsl(var(--danger-border))] bg-danger-subtle p-3"
            role="alert"
          >
            <AlertCircle size={15} className="mt-0.5 shrink-0 text-danger" />
            <div>
              <p className="text-[13px] font-medium text-danger">{error.message}</p>
              {error.hint ? <p className="mt-0.5 text-[12.5px] text-muted">{error.hint}</p> : null}
              {error.code === 'EMAIL_NOT_VERIFIED' ? (
                resent ? (
                  <p className="mt-1.5 text-[12.5px] text-default">A new confirmation link is on its way.</p>
                ) : (
                  <button
                    type="button"
                    onClick={resendVerification}
                    className="mt-1.5 text-[12.5px] font-medium text-brand hover:underline"
                  >
                    Send a new confirmation link
                  </button>
                )
              ) : null}
            </div>
          </div>
        ) : notice ? (
          <div className="rounded-lg border border-[hsl(var(--border))] bg-surface-sunken p-3 text-[13px] text-default" role="status">
            {notice}
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

        <Field
          label="Password"
          htmlFor="password"
          required
        >
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

        <div className="-mt-1 text-right">
          <a href="/forgot-password" className="text-[12.5px] font-medium text-brand hover:underline">
            Forgot password?
          </a>
        </div>

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
                  onClick={() => applyDemoAccount(acc.email)}
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
