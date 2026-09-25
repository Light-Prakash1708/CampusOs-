'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';

/**
 * The single mutation primitive for the faculty portal.
 *
 * Product rules it enforces:
 *   - a failure is never presented as a success; `error` carries the server's
 *     real message and hint, and the caller must render it
 *   - `pending` is exposed so buttons disable and say what they are doing
 *   - `succeeded` only flips after the server confirmed `{ ok: true }`
 */

export interface ApiError {
  code: string;
  message: string;
  hint?: string;
  requestId?: string;
  details?: { field: string; message: string }[];
}

export interface MutationState<TData> {
  pending: boolean;
  error: ApiError | null;
  data: TData | null;
  succeeded: boolean;
}

export function useMutation<TData = unknown>(options?: {
  /** Refresh server components after a successful call. Default true. */
  refresh?: boolean;
  onSuccess?: (data: TData) => void;
}) {
  const router = useRouter();
  const [state, setState] = React.useState<MutationState<TData>>({
    pending: false,
    error: null,
    data: null,
    succeeded: false,
  });

  const optionsRef = React.useRef(options);
  optionsRef.current = options;

  const run = React.useCallback(
    async (
      url: string,
      init: { method?: string; body?: unknown } = {},
    ): Promise<TData | null> => {
      setState({ pending: true, error: null, data: null, succeeded: false });

      let json: { ok: boolean; data?: TData; error?: ApiError };
      try {
        const response = await fetch(url, {
          method: init.method ?? 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: init.body === undefined ? undefined : JSON.stringify(init.body),
        });
        json = (await response.json()) as typeof json;
      } catch {
        setState({
          pending: false,
          succeeded: false,
          data: null,
          error: {
            code: 'NETWORK_ERROR',
            message: 'CampusOS could not reach the server.',
            hint: 'Check your connection and try again — nothing was saved.',
          },
        });
        return null;
      }

      if (!json.ok) {
        setState({
          pending: false,
          succeeded: false,
          data: null,
          error: json.error ?? {
            code: 'UNKNOWN',
            message: 'The server rejected this request without saying why.',
          },
        });
        return null;
      }

      const data = (json.data ?? null) as TData | null;
      setState({ pending: false, error: null, data, succeeded: true });
      if (optionsRef.current?.refresh !== false) router.refresh();
      if (data !== null) optionsRef.current?.onSuccess?.(data);
      return data;
    },
    [router],
  );

  const reset = React.useCallback(
    () => setState({ pending: false, error: null, data: null, succeeded: false }),
    [],
  );

  return { ...state, run, reset };
}
