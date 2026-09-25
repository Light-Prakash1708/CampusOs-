'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Button, Field, Input } from '@/components/ui';
import { ErrorBox, PasswordHints, useApi } from '@/components/auth/useApi';

export function ChangePasswordForm() {
  const router = useRouter();
  const [current, setCurrent] = React.useState('');
  const [next, setNext] = React.useState('');
  const [done, setDone] = React.useState<string | null>(null);
  const api = useApi<{ message: string }>();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const data = await api.call('/api/auth/password/change', { currentPassword: current, newPassword: next });
    if (data) {
      setDone(data.message);
      setCurrent('');
      setNext('');
      router.refresh();
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3" noValidate>
      <ErrorBox error={api.error} />
      {done ? <p className="text-[13px] text-success" role="status">{done}</p> : null}
      <Field label="Current password" htmlFor="cur" required>
        <Input id="cur" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
      </Field>
      <Field label="New password" htmlFor="new" required>
        <Input id="new" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
        <PasswordHints value={next} />
      </Field>
      <Button type="submit" variant="primary" loading={api.loading} disabled={!current || !next}>
        Change password
      </Button>
    </form>
  );
}

export function SessionList({
  sessions,
}: {
  sessions: { id: string; current: boolean; device: string; ip: string | null; lastSeen: string }[];
}) {
  const router = useRouter();
  const api = useApi();
  const others = sessions.filter((s) => !s.current).length;

  async function revoke(id: string) {
    const res = await fetch(`/api/auth/sessions/${id}`, { method: 'DELETE' });
    if (res.ok) router.refresh();
  }
  async function revokeOthers() {
    const data = await api.call('/api/auth/sessions/revoke-others', {});
    if (data) router.refresh();
  }

  return (
    <div>
      <ErrorBox error={api.error} />
      <ul className="divide-y divide-[hsl(var(--border))] rounded-lg border border-[hsl(var(--border))]">
        {sessions.map((s) => (
          <li key={s.id} className="flex items-center gap-3 px-3.5 py-3">
            <div className="min-w-0 flex-1">
              <p className="text-[13.5px] font-medium text-default">
                {s.device} {s.current ? <span className="ml-1 text-[12px] font-normal text-success">· this device</span> : null}
              </p>
              <p className="text-[12px] text-subtle">
                Active {s.lastSeen}
                {s.ip ? ` · ${s.ip}` : ''}
              </p>
            </div>
            {!s.current ? (
              <Button size="sm" variant="ghost" onClick={() => revoke(s.id)} aria-label={`Sign out ${s.device}`}>
                Sign out
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
      {others > 0 ? (
        <Button className="mt-3" size="sm" variant="secondary" loading={api.loading} onClick={revokeOthers}>
          Sign out all other devices
        </Button>
      ) : null}
    </div>
  );
}
