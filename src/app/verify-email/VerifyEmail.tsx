'use client';

import * as React from 'react';
import { CheckCircle2, Clock } from 'lucide-react';
import { Button } from '@/components/ui';
import { ErrorBox, useApi } from '@/components/auth/useApi';

export function VerifyEmail({ token }: { token: string }) {
  const api = useApi<{ outcome: 'ACTIVE' | 'AWAITING_APPROVAL' | 'ALREADY_ACTIVE'; message: string }>();
  const [result, setResult] = React.useState<{ outcome: string; message: string } | null>(null);

  async function confirm() {
    const data = await api.call('/api/auth/verify-email', { token });
    if (data) setResult(data);
  }

  if (result) {
    const waiting = result.outcome === 'AWAITING_APPROVAL';
    const Icon = waiting ? Clock : CheckCircle2;
    return (
      <div className="rounded-lg border border-[hsl(var(--border))] bg-surface-sunken p-4" role="status">
        <Icon size={18} className={waiting ? 'text-warning' : 'text-success'} aria-hidden />
        <p className="mt-2 text-[13.5px] leading-relaxed text-default">{result.message}</p>
        {!waiting ? (
          <a href="/login?verified=1" className="mt-3 inline-flex h-9 items-center rounded-md bg-brand px-3.5 text-sm font-medium text-white">
            Sign in
          </a>
        ) : null}
      </div>
    );
  }

  if (!token) {
    return <ErrorBox error={{ message: 'This confirmation link is incomplete.', hint: 'Open the link from your email again, or sign in to request a new one.' }} />;
  }

  return (
    <div className="space-y-4">
      <ErrorBox error={api.error} />
      <p className="text-[13.5px] leading-relaxed text-muted">Press the button to confirm this address belongs to you.</p>
      <Button variant="primary" size="lg" className="w-full" loading={api.loading} onClick={confirm}>
        Confirm my email
      </Button>
    </div>
  );
}
