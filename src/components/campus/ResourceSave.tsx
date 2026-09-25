'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Bookmark, BookmarkCheck } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Bookmark toggle for a Resource Hub item. Optimistic; rolls back on failure. */
export function ResourceSaveToggle({ resourceId, saved: initial, title }: { resourceId: string; saved: boolean; title: string }) {
  const router = useRouter();
  const [saved, setSaved] = React.useState(initial);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState(false);

  async function toggle() {
    const next = !saved;
    setSaved(next);
    setBusy(true);
    setError(false);
    try {
      const res = await fetch(`/api/resources/${resourceId}/save`, { method: next ? 'POST' : 'DELETE' });
      const json = await res.json().catch(() => ({ ok: false }));
      if (!json.ok) throw new Error();
      router.refresh();
    } catch {
      setSaved(!next);
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  const Icon = saved ? BookmarkCheck : Bookmark;
  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      aria-pressed={saved}
      aria-label={saved ? `Remove “${title}” from saved` : `Save “${title}”`}
      className={cn(
        'inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border-[1.5px] px-3 text-[12.5px] font-bold',
        saved ? 'border-ink bg-sun text-sun-ink' : 'border-[hsl(var(--border-strong))] bg-surface text-default hover:border-ink',
      )}
    >
      <Icon size={15} aria-hidden /> {error ? 'Try again' : saved ? 'Saved' : 'Save'}
    </button>
  );
}
