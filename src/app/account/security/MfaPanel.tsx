'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { KeyRound, ShieldCheck } from 'lucide-react';
import { Button, Field, Input } from '@/components/ui';
import { ErrorBox, useApi } from '@/components/auth/useApi';

interface Status { enabled: boolean; recoveryRemaining: number; required: boolean; enforced: boolean }

/** Set up, use and manage two-step sign-in (TOTP + recovery codes). */
export function MfaPanel({ status, demo }: { status: Status; demo: boolean }) {
  const router = useRouter();
  const api = useApi<{ secret?: string; qrSvg?: string; recoveryCodes?: string[]; disabled?: boolean }>();
  const [setup, setSetup] = React.useState<{ secret: string; qrSvg: string } | null>(null);
  const [codes, setCodes] = React.useState<string[] | null>(null);
  const [code, setCode] = React.useState('');

  async function start() {
    const r = await api.call('/api/account/mfa', { action: 'start' });
    if (r?.secret && r.qrSvg) setSetup({ secret: r.secret, qrSvg: r.qrSvg });
  }
  async function confirm(e: React.FormEvent) {
    e.preventDefault();
    const r = await api.call('/api/account/mfa', { action: 'confirm', code });
    if (r?.recoveryCodes) {
      setCodes(r.recoveryCodes);
      setSetup(null);
      setCode('');
    }
  }
  async function regenerate() {
    const r = await api.call('/api/account/mfa', { action: 'regenerate', code });
    if (r?.recoveryCodes) {
      setCodes(r.recoveryCodes);
      setCode('');
    }
  }
  async function disable() {
    if (await api.call('/api/account/mfa', { action: 'disable', code })) {
      setCode('');
      router.refresh();
    }
  }

  if (demo) return <p className="text-[13px] text-muted">Demo accounts are shared, so two-step sign-in is not available here.</p>;

  if (codes) {
    return (
      <div className="space-y-3">
        <p className="text-[13.5px] font-medium text-default">Save these recovery codes somewhere safe.</p>
        <p className="text-[12.5px] text-muted">Each works once if you lose your phone. They won’t be shown again.</p>
        <ul className="grid grid-cols-2 gap-1.5 rounded-lg border border-[hsl(var(--border))] bg-surface-sunken p-3 font-mono text-[13px] text-default sm:grid-cols-3">
          {codes.map((c) => <li key={c}>{c}</li>)}
        </ul>
        <Button size="sm" variant="primary" onClick={() => { setCodes(null); router.refresh(); }}>I’ve saved them</Button>
      </div>
    );
  }

  if (setup) {
    return (
      <form onSubmit={confirm} className="space-y-3" noValidate>
        <p className="text-[13px] text-default">Scan this with an authenticator app (Google Authenticator, Microsoft Authenticator, 1Password…), then enter the code it shows.</p>
        <div className="h-44 w-44 rounded-lg border border-[hsl(var(--border))] bg-white p-2 [&>svg]:h-full [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: setup.qrSvg }} />
        <p className="text-[12px] text-muted">Can’t scan? Enter this key: <code className="break-all font-mono text-default">{setup.secret}</code></p>
        <Field label="6-digit code" htmlFor="mfa-confirm" error={api.fieldError('code')}>
          <Input id="mfa-confirm" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} className="max-w-[10rem]" />
        </Field>
        <ErrorBox error={api.error} />
        <Button type="submit" size="sm" variant="primary" loading={api.loading} disabled={code.length !== 6}>Turn on</Button>
      </form>
    );
  }

  if (!status.enabled) {
    return (
      <div className="space-y-3">
        {status.required && status.enforced ? (
          <p className="rounded-lg border border-[hsl(var(--warning-border))] bg-warning-subtle p-3 text-[13px] text-default">Your role needs two-step sign-in. Set it up to continue using CampusOS.</p>
        ) : null}
        <p className="text-[13px] text-muted">Sign in with your password plus a code from your phone.</p>
        <ErrorBox error={api.error} />
        <Button size="sm" variant="primary" icon={ShieldCheck} onClick={start} loading={api.loading}>Set up two-step sign-in</Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-[13px] text-default">
        <ShieldCheck size={15} className="mr-1 inline text-success" aria-hidden /> On. {status.recoveryRemaining} recovery codes left.
      </p>
      <Field label="Current code from your app" htmlFor="mfa-manage">
        <Input id="mfa-manage" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} className="max-w-[10rem]" />
      </Field>
      <ErrorBox error={api.error} />
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" icon={KeyRound} onClick={regenerate} loading={api.loading} disabled={code.length !== 6}>New recovery codes</Button>
        {!(status.required && status.enforced) ? (
          <Button size="sm" variant="ghost" onClick={disable} loading={api.loading} disabled={code.length !== 6}>Turn off</Button>
        ) : null}
      </div>
    </div>
  );
}
