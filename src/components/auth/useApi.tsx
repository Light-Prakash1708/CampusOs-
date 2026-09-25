'use client';

import * as React from 'react';

export interface ApiError {
  code?: string;
  message: string;
  hint?: string;
  details?: { field: string; message: string }[];
}

/** Minimal JSON POST helper with the CampusOS error envelope. */
export function useApi<T = unknown>() {
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<ApiError | null>(null);

  const call = React.useCallback(async (url: string, body: unknown, method = 'POST'): Promise<T | null> => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({ ok: false, error: { message: 'Unexpected response from the server.' } }));
      if (!json.ok) {
        setError(json.error ?? { message: 'Something went wrong.' });
        return null;
      }
      return json.data as T;
    } catch {
      setError({ message: 'Could not reach the server.', hint: 'Check your connection and try again.' });
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const fieldError = (field: string) => error?.details?.find((d) => d.field === field)?.message;
  return { call, loading, error, setError, fieldError };
}

export function ErrorBox({ error }: { error: ApiError | null }) {
  if (!error) return null;
  return (
    <div className="rounded-lg border border-[hsl(var(--danger-border))] bg-danger-subtle p-3" role="alert">
      <p className="text-[13px] font-medium text-danger">{error.message}</p>
      {error.hint ? <p className="mt-0.5 text-[12.5px] text-muted">{error.hint}</p> : null}
    </div>
  );
}

/** Live, non-blocking hints that mirror the server's password policy. */
export function PasswordHints({ value }: { value: string }) {
  const rules = [
    { ok: value.length >= 10, label: '10+ characters' },
    { ok: /[a-z]/.test(value) && /[A-Z]/.test(value), label: 'upper & lower case' },
    { ok: /[0-9]/.test(value), label: 'a number' },
  ];
  return (
    <ul className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[12px]" aria-label="Password requirements">
      {rules.map((r) => (
        <li key={r.label} className={r.ok ? 'text-success' : 'text-subtle'}>
          {r.ok ? '✓' : '○'} {r.label}
        </li>
      ))}
    </ul>
  );
}
