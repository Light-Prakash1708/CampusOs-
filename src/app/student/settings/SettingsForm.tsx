'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Check, Save } from 'lucide-react';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  ErrorState,
  Field,
  Input,
} from '@/components/ui';
import { cn, humanize } from '@/lib/utils';

export interface ChannelOption {
  key: 'IN_APP' | 'EMAIL' | 'PUSH' | 'SMS';
  label: string;
  available: boolean;
  unavailableReason: string;
}

export interface PreferenceState {
  category: string;
  channel: string;
  enabled: boolean;
}

/**
 * Notification preferences. Channels the institution has not configured are
 * shown as unavailable with the reason, never as toggles that do nothing.
 */
export function SettingsForm({
  categories,
  channels,
  initialPreferences,
  initialSettings,
}: {
  categories: string[];
  channels: ChannelOption[];
  initialPreferences: PreferenceState[];
  initialSettings: {
    quietHoursEnabled: boolean;
    quietHoursStart: string;
    quietHoursEnd: string;
    digestEnabled: boolean;
  };
}) {
  const router = useRouter();

  const [prefs, setPrefs] = React.useState<Record<string, boolean>>(() =>
    Object.fromEntries(initialPreferences.map((p) => [`${p.category}:${p.channel}`, p.enabled])),
  );
  const [settings, setSettings] = React.useState(initialSettings);
  const [saving, setSaving] = React.useState(false);
  const [saved, setSaved] = React.useState(false);
  const [error, setError] = React.useState<{ message: string; hint?: string } | null>(null);

  const availableChannels = channels.filter((c) => c.available);

  function toggle(category: string, channel: string) {
    const key = `${category}:${channel}`;
    setSaved(false);
    setPrefs((current) => ({ ...current, [key]: !current[key] }));
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setSaved(false);

    try {
      const response = await fetch('/api/student/settings/notifications', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          ...settings,
          preferences: categories.flatMap((category) =>
            availableChannels.map((channel) => ({
              category,
              channel: channel.key,
              enabled: prefs[`${category}:${channel.key}`] ?? true,
            })),
          ),
        }),
      });

      const payload = (await response.json().catch(() => null)) as
        | { ok?: boolean; error?: { message?: string; hint?: string } }
        | null;

      if (!response.ok || !payload?.ok) {
        setError({
          message: payload?.error?.message ?? `Settings were not saved (HTTP ${response.status}).`,
          hint: payload?.error?.hint,
        });
        return;
      }

      setSaved(true);
      router.refresh();
    } catch {
      setError({
        message: 'Could not reach the server.',
        hint: 'Your settings were not saved. Try again when you are back online.',
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save} className="space-y-5">
      <Card>
        <CardHeader
          title="What you are notified about"
          description="In-app notification is always on for notices marked mandatory by the institution."
        />
        <CardBody className="space-y-3">
          {channels.some((c) => !c.available) ? (
            <Alert tone="info">
              {channels
                .filter((c) => !c.available)
                .map((c) => `${c.label}: ${c.unavailableReason}`)
                .join(' ')}
            </Alert>
          ) : null}

          <ul className="divide-y divide-[hsl(var(--border))]">
            {categories.map((category) => (
              <li
                key={category}
                className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <span className="text-[13.5px] font-medium text-default">
                  {humanize(category)}
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {channels.map((channel) => {
                    const key = `${category}:${channel.key}`;
                    const enabled = prefs[key] ?? true;
                    if (!channel.available) {
                      return (
                        <span
                          key={channel.key}
                          title={channel.unavailableReason}
                          className="cursor-not-allowed rounded-full border border-[hsl(var(--border))] px-2.5 py-1 text-[12px] text-subtle opacity-60"
                        >
                          {channel.label} · unavailable
                        </span>
                      );
                    }
                    return (
                      <button
                        key={channel.key}
                        type="button"
                        role="switch"
                        aria-checked={enabled}
                        aria-label={`${humanize(category)} via ${channel.label}`}
                        onClick={() => toggle(category, channel.key)}
                        className={cn(
                          'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] font-medium transition-colors',
                          enabled
                            ? 'border-[hsl(var(--brand-border))] bg-brand-subtle text-brand'
                            : 'border-[hsl(var(--border-strong))] text-subtle hover:bg-surface-sunken',
                        )}
                      >
                        {enabled ? <Check size={12} aria-hidden /> : null}
                        {channel.label}
                      </button>
                    );
                  })}
                </div>
              </li>
            ))}
          </ul>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Quiet hours & digest"
          description="Emergency broadcasts always come through, whatever is set here."
        />
        <CardBody className="space-y-4">
          <label className="flex cursor-pointer items-start gap-2.5">
            <input
              type="checkbox"
              checked={settings.quietHoursEnabled}
              onChange={(e) => {
                setSaved(false);
                setSettings((s) => ({ ...s, quietHoursEnabled: e.target.checked }));
              }}
              className="mt-0.5 h-4 w-4 accent-[hsl(var(--brand))]"
            />
            <span>
              <span className="block text-[13px] font-medium text-default">
                Hold non-urgent notifications during quiet hours
              </span>
              <span className="block text-[12.5px] text-muted">
                They are delivered when the window ends, not dropped.
              </span>
            </span>
          </label>

          <div className="grid max-w-sm gap-3 sm:grid-cols-2">
            <Field label="From" htmlFor="quiet-start">
              <Input
                id="quiet-start"
                type="time"
                value={settings.quietHoursStart}
                disabled={!settings.quietHoursEnabled}
                onChange={(e) => {
                  setSaved(false);
                  setSettings((s) => ({ ...s, quietHoursStart: e.target.value }));
                }}
              />
            </Field>
            <Field label="To" htmlFor="quiet-end">
              <Input
                id="quiet-end"
                type="time"
                value={settings.quietHoursEnd}
                disabled={!settings.quietHoursEnabled}
                onChange={(e) => {
                  setSaved(false);
                  setSettings((s) => ({ ...s, quietHoursEnd: e.target.value }));
                }}
              />
            </Field>
          </div>

          <label className="flex cursor-pointer items-start gap-2.5">
            <input
              type="checkbox"
              checked={settings.digestEnabled}
              onChange={(e) => {
                setSaved(false);
                setSettings((s) => ({ ...s, digestEnabled: e.target.checked }));
              }}
              className="mt-0.5 h-4 w-4 accent-[hsl(var(--brand))]"
            />
            <span>
              <span className="block text-[13px] font-medium text-default">
                Group low-priority updates into a daily digest
              </span>
              <span className="block text-[12.5px] text-muted">
                Fewer interruptions, same information.
              </span>
            </span>
          </label>
        </CardBody>
      </Card>

      {error ? <ErrorState message={error.message} hint={error.hint} /> : null}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="primary" icon={Save} loading={saving}>
          {saving ? 'Saving…' : 'Save preferences'}
        </Button>
        {saved ? (
          <Badge tone="success" dot>
            Saved
          </Badge>
        ) : null}
      </div>
    </form>
  );
}
