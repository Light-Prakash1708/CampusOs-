'use client';

import * as React from 'react';
import { Button, Field, Input } from '@/components/ui';
import { ErrorBox, PasswordHints, useApi } from '@/components/auth/useApi';

/**
 * Student sign-up without a college: name, email and password. The server
 * decides everything else (role, workspace); nothing here can choose them.
 */
export function StudentSignupForm() {
  const [firstName, setFirstName] = React.useState('');
  const [lastName, setLastName] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [confirm, setConfirm] = React.useState('');
  const [mismatch, setMismatch] = React.useState(false);
  const [ageBand, setAgeBand] = React.useState<'' | 'UNDER_18' | '18_OR_OVER'>('');
  const [accepted, setAccepted] = React.useState(false);
  const api = useApi<{ redirectTo: string }>();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      setMismatch(true);
      return;
    }
    setMismatch(false);
    const data = await api.call('/api/auth/register/student', { firstName, lastName, email, password, ageBand, acceptPrivacyNotice: accepted });
    // A full navigation so the new session cookie is used for the portal.
    if (data) window.location.assign(data.redirectTo);
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <ErrorBox error={api.error} />
      <div className="grid grid-cols-1 gap-3 min-[400px]:grid-cols-2">
        <Field label="First name" htmlFor="su-first" required error={api.fieldError('firstName')}>
          <Input id="su-first" autoComplete="given-name" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
        </Field>
        <Field label="Last name" htmlFor="su-last" required error={api.fieldError('lastName')}>
          <Input id="su-last" autoComplete="family-name" value={lastName} onChange={(e) => setLastName(e.target.value)} />
        </Field>
      </div>
      <Field label="Email" htmlFor="su-email" required error={api.fieldError('email')}>
        <Input id="su-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </Field>
      <Field label="Password" htmlFor="su-pw" required error={api.fieldError('password')}>
        <Input id="su-pw" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        <PasswordHints value={password} />
      </Field>
      <Field label="Confirm password" htmlFor="su-pw2" required error={mismatch ? 'The passwords don’t match.' : undefined}>
        <Input id="su-pw2" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      </Field>
      <fieldset className="space-y-2">
        <legend className="text-[13px] font-semibold text-default">Are you 18 or older?</legend>
        <div className="flex flex-wrap gap-4 text-[13.5px] text-default">
          <label className="inline-flex items-center gap-2">
            <input type="radio" name="su-age" value="18_OR_OVER" checked={ageBand === '18_OR_OVER'} onChange={() => setAgeBand('18_OR_OVER')} /> Yes, I’m 18 or older
          </label>
          <label className="inline-flex items-center gap-2">
            <input type="radio" name="su-age" value="UNDER_18" checked={ageBand === 'UNDER_18'} onChange={() => setAgeBand('UNDER_18')} /> No, I’m under 18
          </label>
        </div>
        {ageBand === 'UNDER_18' ? (
          <p className="text-[12.5px] leading-relaxed text-muted" role="status">
            Personal accounts are for students aged 18 or over. If your college uses CampusOS, ask the college office for an invitation — your college takes care of consent for its students.
          </p>
        ) : null}
        {api.fieldError('ageBand') ? <p className="text-[12.5px] text-danger">{api.fieldError('ageBand')}</p> : null}
      </fieldset>
      <label className="flex items-start gap-2 text-[13px] leading-relaxed text-default">
        <input type="checkbox" className="mt-1" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} />
        <span>
          I have read the{' '}
          <a href="/privacy" target="_blank" rel="noopener" className="font-semibold text-brand underline-offset-2 hover:underline">
            privacy notice
          </a>{' '}
          and agree to CampusOS processing my data as it describes.
        </span>
      </label>
      <p className="text-[12px] leading-relaxed text-subtle">
        Your account is private to you. Your college can still invite you later; your college account is
        separate and your college manages it.
      </p>
      <Button
        variant="primary"
        size="lg"
        type="submit"
        className="w-full"
        loading={api.loading}
        disabled={!firstName || !lastName || !email || !password || !confirm || ageBand !== '18_OR_OVER' || !accepted}
      >
        Create Student Account
      </Button>
    </form>
  );
}
