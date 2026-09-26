'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Check, Copy } from 'lucide-react';
import { Button } from '@/components/ui';
import { useApi } from '@/components/auth/useApi';

/**
 * Shown when an invitation email could not be delivered (no email provider):
 * the one-time link, to pass on privately. It is never stored or logged.
 */
export function InviteLinkNotice({ url, email }: { url: string; email: string }) {
  const [copied, setCopied] = React.useState(false);
  return (
    <div className="rounded-lg border border-[hsl(var(--warning-border))] bg-warning-subtle p-3 text-[13px]" role="status">
      <p className="font-medium text-default">Email isn’t set up, so send {email} this one-time link yourself:</p>
      <div className="mt-2 flex items-center gap-2">
        <input
          readOnly
          value={url}
          aria-label="Invitation link"
          className="min-w-0 flex-1 rounded-md border border-[hsl(var(--border))] bg-surface px-2 py-1.5 font-mono text-[12px] text-default"
          onFocus={(e) => e.currentTarget.select()}
        />
        <Button
          size="sm"
          variant="secondary"
          icon={copied ? Check : Copy}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(url);
              setCopied(true);
            } catch {
              /* select-and-copy still works */
            }
          }}
        >
          {copied ? 'Copied' : 'Copy'}
        </Button>
      </div>
      <p className="mt-1.5 text-[12px] text-muted">It works once and expires in 7 days. Share it privately — anyone with it can set this account’s password.</p>
    </div>
  );
}

/** Resend or withdraw an invitation that hasn't been accepted. */
export function InviteActions({ userId, email }: { userId: string; email: string }) {
  const router = useRouter();
  const api = useApi<{ emailSent?: boolean; inviteUrl?: string | null }>();
  const [link, setLink] = React.useState<string | null>(null);
  const [msg, setMsg] = React.useState<string | null>(null);
  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex items-center gap-2">
        {msg ? <span className="text-[12px] text-success">{msg}</span> : null}
        {api.error ? <span className="text-[12px] text-danger">{api.error.message}</span> : null}
        <Button
          size="sm"
          variant="ghost"
          loading={api.loading}
          onClick={async () => {
            const d = await api.call(`/api/admin/users/${userId}/resend-invite`, {});
            if (d) {
              setLink(d.inviteUrl ?? null);
              setMsg(d.emailSent ? 'Sent' : null);
            }
          }}
        >
          Resend
        </Button>
        <Button
          size="sm"
          variant="ghost"
          loading={api.loading}
          onClick={async () => {
            if (!window.confirm(`Withdraw the invitation for ${email}? The link will stop working.`)) return;
            const d = await api.call(`/api/admin/users/${userId}/revoke-invite`, {});
            if (d) router.refresh();
          }}
        >
          Withdraw
        </Button>
      </div>
      {link ? <InviteLinkNotice url={link} email={email} /> : null}
    </div>
  );
}

/** Suspend or restore someone's access. */
export function AccessToggle({ userId, status, name }: { userId: string; status: string; name: string }) {
  const router = useRouter();
  const api = useApi();
  if (status !== 'ACTIVE' && status !== 'SUSPENDED') return null;
  const suspend = status === 'ACTIVE';
  return (
    <span className="inline-flex items-center gap-2">
      {api.error ? <span className="text-[12px] text-danger">{api.error.message}</span> : null}
      <Button
        size="sm"
        variant="ghost"
        loading={api.loading}
        onClick={async () => {
          if (suspend && !window.confirm(`Suspend ${name}? They are signed out everywhere and can’t sign in until restored.`)) return;
          const d = await api.call(`/api/admin/users/${userId}/access`, { action: suspend ? 'SUSPEND' : 'REACTIVATE' });
          if (d) router.refresh();
        }}
      >
        {suspend ? 'Suspend' : 'Restore'}
      </Button>
    </span>
  );
}
