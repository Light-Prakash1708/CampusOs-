'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Search, CornerDownLeft, Loader2, Sparkles, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * GLOBAL COMMAND PALETTE (⌘/Ctrl + K)
 *
 * Two modes in one input:
 *   - Navigation/search: matches against results the server returns, already
 *     filtered by the caller's permissions. The palette never widens access.
 *   - Ask: anything the search cannot answer is offered to the AI assistant.
 */

interface SearchResult {
  id: string;
  title: string;
  subtitle?: string;
  group: string;
  href: string;
}

export function CommandPalette({
  open,
  onOpenChange,
  portal,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  portal: 'student' | 'faculty' | 'admin';
}) {
  const router = useRouter();
  const [query, setQuery] = React.useState('');
  const [results, setResults] = React.useState<SearchResult[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [activeIndex, setActiveIndex] = React.useState(0);
  const [error, setError] = React.useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  // Reset when the palette closes, not when it opens: the input is focused on
  // mount (autoFocus) so the very first keystroke after ⌘K is never lost, and
  // an on-open reset could wipe what was already typed.
  React.useEffect(() => {
    if (!open) {
      setQuery('');
      setResults([]);
      setActiveIndex(0);
      setError(null);
    }
  }, [open]);

  // Debounced server search.
  React.useEffect(() => {
    if (!open) return;
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, {
          signal: controller.signal,
        });
        const json = await res.json();
        if (json.ok) {
          setResults(json.data.results ?? []);
          setError(null);
        } else {
          setError(json.error?.message ?? 'Search is unavailable right now.');
        }
      } catch (e) {
        if ((e as Error).name !== 'AbortError') setError('Search is unavailable right now.');
      } finally {
        setLoading(false);
      }
    }, 180);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, open]);

  const askOption = query.trim().length >= 2;
  const totalOptions = results.length + (askOption ? 1 : 0);

  function activate(index: number) {
    if (askOption && index === results.length) {
      router.push(`/${portal}/assistant?q=${encodeURIComponent(query.trim())}`);
      onOpenChange(false);
      return;
    }
    const target = results[index];
    if (target) {
      router.push(target.href);
      onOpenChange(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % Math.max(1, totalOptions));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => (i - 1 + Math.max(1, totalOptions)) % Math.max(1, totalOptions));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      activate(activeIndex);
    } else if (e.key === 'Escape') {
      onOpenChange(false);
    }
  }

  if (!open) return null;

  const grouped = results.reduce<Record<string, SearchResult[]>>((acc, r) => {
    (acc[r.group] ??= []).push(r);
    return acc;
  }, {});

  let flatIndex = -1;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center bg-black/40 px-4 pt-[12vh] backdrop-blur-sm"
      onClick={() => onOpenChange(false)}
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
    >
      <div
        className="w-full max-w-xl animate-fade-up overflow-hidden rounded-xl border border-[hsl(var(--border))] bg-surface shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2.5 border-b border-[hsl(var(--border))] px-4">
          {loading ? (
            <Loader2 size={16} className="animate-spin text-subtle" />
          ) : (
            <Search size={16} className="text-subtle" />
          )}
          <input
            ref={inputRef}
            autoFocus
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={onKeyDown}
            placeholder="Search classes, people, notices — or ask a question"
            className="h-12 flex-1 bg-transparent text-[14px] text-default outline-none placeholder:text-subtle"
            aria-label="Search"
            aria-autocomplete="list"
          />
          <kbd className="rounded border border-[hsl(var(--border))] px-1.5 py-0.5 font-mono text-[10px] text-subtle">
            ESC
          </kbd>
        </div>

        <div className="max-h-[52vh] overflow-y-auto p-2">
          {query.trim().length < 2 ? (
            <div className="px-3 py-6 text-center">
              <p className="text-[13px] text-muted">Start typing to search.</p>
              <p className="mt-1 text-[12px] text-subtle">
                Try “tomorrow’s classes”, a room number, or a person’s name.
              </p>
            </div>
          ) : error ? (
            <div className="px-3 py-6 text-center">
              <p className="text-[13px] text-danger">{error}</p>
              <p className="mt-1 text-[12px] text-subtle">You can still ask the assistant below.</p>
            </div>
          ) : null}

          {Object.entries(grouped).map(([group, items]) => (
            <div key={group} className="mb-1">
              <p className="px-3 py-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-subtle">
                {group}
              </p>
              {items.map((item) => {
                flatIndex += 1;
                const index = flatIndex;
                return (
                  <button
                    key={item.id}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => activate(index)}
                    className={cn(
                      'flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left transition-colors',
                      activeIndex === index ? 'bg-brand-subtle' : 'hover:bg-surface-sunken',
                    )}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px] font-medium text-default">
                        {item.title}
                      </span>
                      {item.subtitle ? (
                        <span className="block truncate text-[12px] text-subtle">
                          {item.subtitle}
                        </span>
                      ) : null}
                    </span>
                    {activeIndex === index ? (
                      <CornerDownLeft size={13} className="shrink-0 text-brand" />
                    ) : (
                      <ArrowRight size={13} className="shrink-0 text-subtle opacity-0" />
                    )}
                  </button>
                );
              })}
            </div>
          ))}

          {askOption ? (
            <>
              {results.length > 0 ? (
                <div className="my-1 h-px bg-[hsl(var(--border))]" />
              ) : null}
              <button
                onMouseEnter={() => setActiveIndex(results.length)}
                onClick={() => activate(results.length)}
                className={cn(
                  'flex w-full items-center gap-2.5 rounded-md px-3 py-2.5 text-left transition-colors',
                  activeIndex === results.length ? 'bg-brand-subtle' : 'hover:bg-surface-sunken',
                )}
              >
                <Sparkles size={15} className="shrink-0 text-brand" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-medium text-default">
                    Ask the assistant: “{query.trim()}”
                  </span>
                  <span className="block text-[12px] text-subtle">
                    Answers use only records you are allowed to see
                  </span>
                </span>
                <CornerDownLeft size={13} className="shrink-0 text-brand" />
              </button>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
