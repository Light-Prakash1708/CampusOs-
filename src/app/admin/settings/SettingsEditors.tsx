'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Button, Field, Input, Select } from '@/components/ui';
import { ErrorBox, useApi } from '@/components/auth/useApi';

export function FeatureToggle({ flag, label, enabled }: { flag: string; label: string; enabled: boolean }) {
  const router = useRouter();
  const [on, setOn] = React.useState(enabled);
  const api = useApi();
  async function toggle() {
    const next = !on;
    setOn(next);
    const data = await api.call('/api/admin/settings/features', { flags: { [flag]: next } }, 'PATCH');
    if (!data) setOn(!next);
    else router.refresh();
  }
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={`${label}: ${on ? 'enabled' : 'disabled'}`}
      title={api.error?.message}
      onClick={toggle}
      disabled={api.loading}
      className={`relative h-6 w-10 rounded-full transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand))] disabled:opacity-60 ${on ? 'bg-brand' : 'bg-[hsl(var(--border-strong))]'}`}
    >
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform motion-reduce:transition-none ${on ? 'translate-x-[18px]' : 'translate-x-0.5'}`} />
    </button>
  );
}

export function RegistrationPolicyForm({
  initial,
}: {
  initial: { mode: 'DISABLED' | 'EMAIL_DOMAIN' | 'ADMIN_APPROVAL'; allowedDomains: string[]; isListed: boolean };
}) {
  const router = useRouter();
  const api = useApi();
  const [mode, setMode] = React.useState(initial.mode);
  const [domains, setDomains] = React.useState(initial.allowedDomains.join(', '));
  const [listed, setListed] = React.useState(initial.isListed);
  const [saved, setSaved] = React.useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaved(false);
    const data = await api.call(
      '/api/admin/settings/registration',
      {
        mode,
        allowedDomains: domains.split(/[,\s]+/).map((d) => d.trim()).filter(Boolean),
        isListed: listed,
      },
      'PATCH',
    );
    if (data) {
      setSaved(true);
      router.refresh();
    }
  }

  return (
    <form onSubmit={save} className="space-y-4" noValidate>
      <ErrorBox error={api.error} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Who can create an account" htmlFor="reg-mode">
          <Select id="reg-mode" value={mode} onChange={(e) => setMode(e.target.value as typeof mode)}>
            <option value="DISABLED">Invitation or import only</option>
            <option value="EMAIL_DOMAIN">Students with a college email address</option>
            <option value="ADMIN_APPROVAL">Anyone, after an administrator approves</option>
          </Select>
        </Field>
        <Field label="College email domains" htmlFor="reg-domains" hint="e.g. kbi.edu.in — required for email-domain registration" error={api.fieldError('allowedDomains')}>
          <Input id="reg-domains" value={domains} onChange={(e) => setDomains(e.target.value)} disabled={mode !== 'EMAIL_DOMAIN'} />
        </Field>
      </div>
      <label className="flex items-center gap-2 text-[13px] text-default">
        <input type="checkbox" checked={listed} onChange={(e) => setListed(e.target.checked)} />
        List this college on the public registration page
      </label>
      <div className="flex items-center gap-3">
        <Button type="submit" variant="primary" loading={api.loading}>Save registration settings</Button>
        {saved ? <span className="text-[12.5px] text-success" role="status">Saved</span> : null}
      </div>
    </form>
  );
}
