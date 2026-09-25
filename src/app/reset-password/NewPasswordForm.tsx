'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Button, Field, Input } from '@/components/ui';
import { ErrorBox, PasswordHints, useApi } from '@/components/auth/useApi';

/** Used by both password reset and invitation acceptance. */
export function NewPasswordForm({
  token,
  endpoint,
  submitLabel,
}: {
  token: string;
  endpoint: string;
  submitLabel: string;
}) {
  const router = useRouter();
  const [password, setPassword] = React.useState('');
  const [confirm, setConfirm] = React.useState('');
  const api = useApi<{ redirectTo: string }>();
  const mismatch = confirm.length > 0 && confirm !== password;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) return;
    const data = await api.call(endpoint, { token, password });
    if (data) {
      router.push(data.redirectTo);
      router.refresh();
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <ErrorBox error={api.error} />
      <Field label="New password" htmlFor="password" required>
        <Input id="password" type="password" autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        <PasswordHints value={password} />
      </Field>
      <Field label="Confirm password" htmlFor="confirm" required error={mismatch ? 'The passwords do not match.' : undefined}>
        <Input id="confirm" type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} aria-invalid={mismatch} />
      </Field>
      <Button type="submit" variant="primary" size="lg" loading={api.loading} disabled={!password || mismatch} className="w-full">
        {submitLabel}
      </Button>
    </form>
  );
}
