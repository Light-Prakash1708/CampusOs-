'use client';

import * as React from 'react';
import { MailCheck } from 'lucide-react';
import { Button, Field, Input } from '@/components/ui';
import { ErrorBox, useApi } from '@/components/auth/useApi';

export function ForgotForm() {
  const [email, setEmail] = React.useState('');
  const [done, setDone] = React.useState<string | null>(null);
  const api = useApi<{ message: string }>();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const data = await api.call('/api/auth/password/forgot', { email });
    if (data) setDone(data.message);
  }

  if (done) {
    return (
      <div className="rounded-lg border border-[hsl(var(--border))] bg-surface-sunken p-4" role="status">
        <MailCheck size={18} className="text-success" aria-hidden />
        <p className="mt-2 text-[13.5px] font-medium text-default">Check your inbox</p>
        <p className="mt-1 text-[13px] leading-relaxed text-muted">{done}</p>
        <p className="mt-2 text-[12.5px] text-subtle">Nothing after a few minutes? Check spam, or try again.</p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <ErrorBox error={api.error} />
      <Field label="Email address" htmlFor="email" required error={api.fieldError('email')}>
        <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@college.edu.in" />
      </Field>
      <Button type="submit" variant="primary" size="lg" loading={api.loading} className="w-full">
        Send reset link
      </Button>
    </form>
  );
}
