'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Send } from 'lucide-react';
import { Button, ErrorState, Field, Textarea } from '@/components/ui';

/**
 * Adds a reply to a case the student raised. The route re-checks that the
 * caller is the raiser or a handler — this component is convenience, not
 * access control.
 */
export function ReplyBox({ grievanceId, disabled, disabledReason }: {
  grievanceId: string;
  disabled: boolean;
  disabledReason?: string;
}) {
  const router = useRouter();
  const [body, setBody] = React.useState('');
  const [sending, setSending] = React.useState(false);
  const [error, setError] = React.useState<{ message: string; hint?: string } | null>(null);
  const [fieldError, setFieldError] = React.useState<string | undefined>();

  if (disabled) {
    return (
      <p className="rounded-lg border border-[hsl(var(--border))] bg-surface-muted px-4 py-3 text-[13px] text-muted">
        {disabledReason ?? 'This case is closed, so new replies cannot be added.'}
      </p>
    );
  }

  async function send(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setFieldError(undefined);

    if (body.trim().length < 2) {
      setFieldError('Write your reply before sending.');
      return;
    }

    setSending(true);
    try {
      const response = await fetch(`/api/student/redressal/${grievanceId}/messages`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ body: body.trim() }),
      });

      const payload = (await response.json().catch(() => null)) as
        | { ok?: boolean; error?: { message?: string; hint?: string } }
        | null;

      if (!response.ok || !payload?.ok) {
        setError({
          message:
            payload?.error?.message ?? `Your reply was not saved (HTTP ${response.status}).`,
          hint: payload?.error?.hint,
        });
        return;
      }

      setBody('');
      router.refresh();
    } catch {
      setError({
        message: 'Could not reach the server.',
        hint: 'Your reply was not saved. Copy the text before retrying.',
      });
    } finally {
      setSending(false);
    }
  }

  return (
    <form onSubmit={send} className="space-y-3" noValidate>
      <Field
        label="Add a reply"
        htmlFor="reply"
        error={fieldError}
        hint="The handler assigned to your case is notified. Internal notes between staff are never shown to you, and yours are never hidden from them."
      >
        <Textarea
          id="reply"
          rows={4}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Add information, answer a question, or ask for an update…"
          maxLength={4000}
          aria-invalid={!!fieldError}
        />
      </Field>

      {error ? <ErrorState message={error.message} hint={error.hint} /> : null}

      <Button type="submit" variant="primary" size="sm" icon={Send} loading={sending}>
        {sending ? 'Sending…' : 'Send reply'}
      </Button>
    </form>
  );
}
