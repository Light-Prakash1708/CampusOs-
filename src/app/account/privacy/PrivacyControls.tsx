'use client';

import * as React from 'react';
import { Download, Trash2 } from 'lucide-react';
import { Button, Field, Input, Select } from '@/components/ui';
import { ErrorBox, useApi } from '@/components/auth/useApi';
import type { PrivacyPrefs } from '@/services/privacy/rules';

function Toggle({
  id,
  label,
  description,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  description: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 px-4 py-3">
      <label htmlFor={id} className="min-w-0 cursor-pointer">
        <span className="block text-[13.5px] font-medium text-default">{label}</span>
        <span className="block text-[12.5px] leading-relaxed text-muted">{description}</span>
      </label>
      <button
        id={id}
        role="switch"
        type="button"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative mt-0.5 h-6 w-10 shrink-0 rounded-full transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand))] ${checked ? 'bg-brand' : 'bg-[hsl(var(--border-strong))]'}`}
      >
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform motion-reduce:transition-none ${checked ? 'translate-x-[18px]' : 'translate-x-0.5'}`} />
      </button>
    </div>
  );
}

export function PrivacyControls({ initial, coachScopes }: { initial: PrivacyPrefs; coachScopes: string[] }) {
  const [prefs, setPrefs] = React.useState(initial);
  const [saved, setSaved] = React.useState(false);
  const api = useApi<PrivacyPrefs>();

  async function save(patch: Partial<PrivacyPrefs>) {
    const previous = prefs;
    setPrefs({ ...prefs, ...patch }); // optimistic
    setSaved(false);
    const data = await api.call('/api/privacy/preferences', patch, 'PATCH');
    if (data) {
      setPrefs(data);
      setSaved(true);
    } else {
      setPrefs(previous);
    }
  }

  return (
    <div className="space-y-3">
      <ErrorBox error={api.error} />
      <div className="divide-y divide-[hsl(var(--border))] rounded-lg border border-[hsl(var(--border))] bg-surface">
        <div className="px-4 py-3">
          <Field label="Leaderboards" htmlFor="lb" hint="Attendance, grades and private goals are never shown on leaderboards.">
            <Select id="lb" value={prefs.leaderboardVisibility} onChange={(e) => save({ leaderboardVisibility: e.target.value as PrivacyPrefs['leaderboardVisibility'] })}>
              <option value="PRIVATE">Private — only I see my position (default)</option>
              <option value="ANONYMOUS">Anonymous — others see a pseudonym</option>
              <option value="PUBLIC">Public — others see my name</option>
              <option value="OPT_OUT">Opt out — leave leaderboards entirely</option>
            </Select>
          </Field>
        </div>
        <div className="px-4 py-3">
          <Field label="Profile visible to" htmlFor="pv">
            <Select id="pv" value={prefs.profileVisibility} onChange={(e) => save({ profileVisibility: e.target.value as PrivacyPrefs['profileVisibility'] })}>
              <option value="INSTITUTION">People at my college</option>
              <option value="PRIVATE">Only me (others see just my name)</option>
            </Select>
          </Field>
        </div>
        <Toggle id="streaks" label="Show my streaks on my profile" description="Off by default. Streaks are always visible to you." checked={prefs.showStreaks} onChange={(v) => save({ showStreaks: v })} />
        <Toggle id="ach" label="Show badges on my profile" description="Badges you have earned from verified activity." checked={prefs.showAchievements} onChange={(v) => save({ showAchievements: v })} />
        <Toggle id="events" label="Show events I attended on my profile" description="Off by default. Organisers always see their own attendee lists." checked={prefs.showEventParticipation} onChange={(v) => save({ showEventParticipation: v })} />
        <Toggle id="recs" label="Personalised recommendations" description="Use my interests and activity to suggest events, resources and opportunities. Off means everyone sees the same lists." checked={prefs.personalizedRecommendations} onChange={(v) => save({ personalizedRecommendations: v })} />
        <Toggle id="mem" label="AI memory" description="Let the assistant remember study and planning preferences. Turning this off deletes what it remembered." checked={prefs.aiMemoryEnabled} onChange={(v) => save({ aiMemoryEnabled: v })} />
        <div className="px-4 py-3">
          <p className="text-[13.5px] font-medium text-default">What the AI Coach may read</p>
          <p className="text-[12.5px] text-muted">Nothing is shared until you tick it.</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {coachScopes.map((scope) => {
              const on = prefs.aiCoachScopes.includes(scope as never);
              return (
                <button
                  key={scope}
                  type="button"
                  aria-pressed={on}
                  onClick={() =>
                    save({
                      aiCoachScopes: (on ? prefs.aiCoachScopes.filter((s) => s !== scope) : [...prefs.aiCoachScopes, scope]) as PrivacyPrefs['aiCoachScopes'],
                    })
                  }
                  className={`rounded-full border px-3 py-1 text-[12.5px] capitalize ${on ? 'border-[hsl(var(--brand))] bg-brand-subtle text-brand' : 'border-[hsl(var(--border))] text-muted hover:text-default'}`}
                >
                  {scope}
                </button>
              );
            })}
          </div>
        </div>
      </div>
      <p className="h-4 text-[12px] text-subtle" aria-live="polite">{saved ? 'Saved.' : ''}</p>
    </div>
  );
}

export function DataRights() {
  const api = useApi<{ status: string; removed?: number }>();
  const [confirm, setConfirm] = React.useState('');
  const [reason, setReason] = React.useState('');
  const [message, setMessage] = React.useState<string | null>(null);

  async function deleteScope(scope: 'AI_MEMORY' | 'PERSONAL_TRACKER') {
    const data = await api.call('/api/privacy/deletion', { scope });
    if (data) setMessage(scope === 'AI_MEMORY' ? 'AI memory deleted.' : 'Personal tracker data deleted.');
  }
  async function requestAccountDeletion() {
    const data = await api.call('/api/privacy/deletion', { scope: 'ACCOUNT', reason: reason || null, confirm: 'DELETE' });
    if (data) {
      setMessage('Request sent. Your college will review it; academic records they must keep are anonymised rather than deleted.');
      setConfirm('');
    }
  }

  return (
    <div className="space-y-3">
      <ErrorBox error={api.error} />
      {message ? <p className="text-[13px] text-success" role="status">{message}</p> : null}
      <div className="rounded-lg border border-[hsl(var(--border))] bg-surface p-4">
        <p className="text-[13.5px] font-medium text-default">Download my data</p>
        <p className="text-[12.5px] text-muted">A JSON file with everything CampusOS holds about you — and nothing about anyone else.</p>
        <a href="/api/privacy/export" className="mt-3 inline-flex h-8 items-center gap-1.5 rounded-md border border-[hsl(var(--border-strong))] bg-surface px-3 text-[13px] font-medium text-default hover:bg-surface-sunken">
          <Download size={14} aria-hidden /> Download
        </a>
      </div>
      <div className="rounded-lg border border-[hsl(var(--border))] bg-surface p-4">
        <p className="text-[13.5px] font-medium text-default">Delete personal data</p>
        <p className="text-[12.5px] text-muted">Removed immediately. This does not affect your academic records.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" icon={Trash2} onClick={() => deleteScope('AI_MEMORY')} loading={api.loading}>Delete AI memory</Button>
          <Button size="sm" variant="secondary" icon={Trash2} onClick={() => deleteScope('PERSONAL_TRACKER')} loading={api.loading}>Delete tracker data</Button>
        </div>
      </div>
      <div className="rounded-lg border border-[hsl(var(--danger-border))] bg-surface p-4">
        <p className="text-[13.5px] font-medium text-default">Delete my account</p>
        <p className="text-[12.5px] leading-relaxed text-muted">
          Your college reviews account deletion because some academic records must legally be kept. If approved,
          your personal data is deleted and remaining academic records are anonymised.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label="Reason (optional)" htmlFor="reason">
            <Input id="reason" value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
          <Field label='Type "DELETE" to confirm' htmlFor="confirm">
            <Input id="confirm" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" />
          </Field>
        </div>
        <Button className="mt-3" size="sm" variant="danger" disabled={confirm !== 'DELETE'} loading={api.loading} onClick={requestAccountDeletion}>
          Request account deletion
        </Button>
      </div>
    </div>
  );
}
