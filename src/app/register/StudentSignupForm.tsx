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
  const api = useApi<{ redirectTo: string }>();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      setMismatch(true);
      return;
    }
    setMismatch(false);
    const data = await api.call('/api/auth/register/student', { firstName, lastName, email, password });
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
        disabled={!firstName || !lastName || !email || !password || !confirm}
      >
        Create Student Account
      </Button>
    </form>
  );
}
