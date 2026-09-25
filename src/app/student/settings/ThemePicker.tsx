'use client';

import * as React from 'react';
import { Monitor, Moon, Sun } from 'lucide-react';
import { cn } from '@/lib/utils';

type Theme = 'system' | 'light' | 'dark';

const OPTIONS: { key: Theme; label: string; icon: typeof Sun; hint: string }[] = [
  { key: 'system', label: 'System', icon: Monitor, hint: 'Follow your device setting' },
  { key: 'light', label: 'Light', icon: Sun, hint: 'Always light' },
  { key: 'dark', label: 'Dark', icon: Moon, hint: 'Always dark' },
];

/**
 * Theme is the one thing we deliberately keep in localStorage — it is a device
 * preference, not institutional data, and it must apply before first paint.
 */
export function ThemePicker() {
  const [theme, setTheme] = React.useState<Theme>('system');
  const [ready, setReady] = React.useState(false);

  React.useEffect(() => {
    try {
      const stored = localStorage.getItem('campusos-theme');
      setTheme(stored === 'dark' || stored === 'light' ? stored : 'system');
    } catch {
      /* storage unavailable — fall back to system */
    }
    setReady(true);
  }, []);

  function apply(next: Theme) {
    setTheme(next);
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const dark = next === 'dark' || (next === 'system' && prefersDark);
    document.documentElement.classList.toggle('dark', dark);
    try {
      if (next === 'system') localStorage.removeItem('campusos-theme');
      else localStorage.setItem('campusos-theme', next);
    } catch {
      /* storage unavailable — the choice applies for this session only */
    }
  }

  return (
    <div>
      <div role="radiogroup" aria-label="Theme" className="grid gap-2 sm:grid-cols-3">
        {OPTIONS.map((option) => {
          const Icon = option.icon;
          const selected = ready && theme === option.key;
          return (
            <button
              key={option.key}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => apply(option.key)}
              className={cn(
                'flex items-center gap-2.5 rounded-lg border p-3 text-left transition-colors',
                selected
                  ? 'border-[hsl(var(--brand-border))] bg-brand-subtle'
                  : 'border-[hsl(var(--border))] hover:bg-surface-sunken',
              )}
            >
              <Icon
                size={16}
                className={selected ? 'text-brand' : 'text-subtle'}
                aria-hidden
              />
              <span className="min-w-0">
                <span
                  className={cn(
                    'block text-[13px] font-medium',
                    selected ? 'text-brand' : 'text-default',
                  )}
                >
                  {option.label}
                </span>
                <span className="block text-[11.5px] text-subtle">{option.hint}</span>
              </span>
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-[12px] text-subtle">
        Saved on this device only, so it does not follow you to another computer.
      </p>
    </div>
  );
}
