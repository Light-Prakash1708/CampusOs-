'use client';

import * as React from 'react';

/** Fetches a fresh signed QR every few minutes while the pass is open. */
export function PassQr({ eventId, code }: { eventId: string; code: string }) {
  const [svg, setSvg] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const load = React.useCallback(async () => {
    try {
      const res = await fetch(`/api/events/${eventId}/pass`, { cache: 'no-store' });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error?.message);
      setSvg(json.data.svg);
      setError(null);
    } catch (e) {
      setError((e as Error).message || 'Could not load your pass.');
    }
  }, [eventId]);
  React.useEffect(() => {
    void load();
    const id = window.setInterval(load, 4 * 60_000);
    return () => window.clearInterval(id);
  }, [load]);
  return (
    <div className="mt-4">
      <div className="mx-auto flex aspect-square w-full max-w-[260px] items-center justify-center rounded-2xl border-[1.5px] border-ink bg-white p-3" role="img" aria-label="QR code pass for check-in">
        {svg ? <div className="h-full w-full [&>svg]:h-full [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: svg }} /> : <div className="skeleton h-full w-full" />}
      </div>
      {error ? <p className="mt-2 text-[12.5px] font-semibold text-coral-ink" role="alert">{error}</p> : null}
      <p className="mt-3 text-[12px] font-bold uppercase tracking-wider text-subtle">Pass code</p>
      <p className="font-mono text-[26px] font-extrabold tracking-[0.2em] text-default">{code}</p>
    </div>
  );
}
